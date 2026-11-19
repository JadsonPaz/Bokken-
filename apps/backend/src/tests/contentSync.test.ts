import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContentSyncEntityType, ContentSyncOperation } from '@prisma/client';
import { ZodError } from 'zod';
import { QuestionType } from '@bokken/shared';
import { ContentSyncRecord, IContentSyncRepository } from '../repositories/contentSyncRepository.js';
import { ContentSyncService } from '../services/contentSyncService.js';
import { decodeContentSyncCursor } from '../services/contentSyncCursor.js';

class MemoryContentSyncRepository implements IContentSyncRepository {
  changes: Array<ContentSyncRecord & { userId: string }> = [];

  async getLastSequence(userId: string): Promise<bigint> {
    return this.changes.filter(change => change.userId === userId).reduce((max, change) => change.sequence > max ? change.sequence : max, 0n);
  }

  async findChanges(userId: string, after: bigint, through: bigint, take: number): Promise<ContentSyncRecord[]> {
    return this.changes
      .filter(change => change.userId === userId && change.sequence > after && change.sequence <= through)
      .sort((left, right) => left.sequence < right.sequence ? -1 : 1)
      .slice(0, take);
  }

  append(userId: string, sequence: bigint, payload: unknown): void {
    const focusId = (payload as { focus: { id: string } }).focus.id;
    this.changes.push({
      userId,
      sequence,
      entityType: ContentSyncEntityType.FOCUS,
      operation: ContentSyncOperation.UPSERT,
      entityId: focusId,
      parentId: null,
      payload: payload as ContentSyncRecord['payload'],
      createdAt: new Date()
    });
  }
}

function focusPayload(name: string) {
  const now = new Date().toISOString();
  return {
    focus: {
      id: crypto.randomUUID(),
      name,
      description: null,
      color: '#1e3a8a',
      createdAt: now,
      updatedAt: now
    }
  };
}

describe('ContentSyncService', () => {
  it('página bootstrap, continua com watermark fixo e inclui mudanças concorrentes na próxima rodada', async () => {
    const userId = crypto.randomUUID();
    const repository = new MemoryContentSyncRepository();
    repository.append(userId, 1n, focusPayload('Foco 1'));
    repository.append(userId, 2n, focusPayload('Foco 2'));
    repository.append(userId, 3n, focusPayload('Foco 3'));
    const service = new ContentSyncService(repository);

    const first = await service.pull(userId, undefined, 2);
    assert.deepEqual(first.changes.map(change => change.sequence), ['1', '2']);
    assert.equal(first.hasMore, true);
    assert.equal(first.nextCursor.includes(userId), false, 'O cursor cifrado não expõe o usuário');

    repository.append(userId, 4n, focusPayload('Foco concorrente'));
    const continuation = await service.pull(userId, first.nextCursor, 2);
    assert.deepEqual(continuation.changes.map(change => change.sequence), ['3']);
    assert.equal(continuation.hasMore, false);

    const nextRound = await service.pull(userId, continuation.nextCursor, 2);
    assert.deepEqual(nextRound.changes.map(change => change.sequence), ['4']);
    assert.equal(nextRound.hasMore, false);
  });

  it('rejeita cursor alterado ou pertencente a outra conta', async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const repository = new MemoryContentSyncRepository();
    repository.append(userId, 1n, focusPayload('Foco privado'));
    const service = new ContentSyncService(repository);
    const page = await service.pull(userId, undefined, 1);

    assert.throws(() => decodeContentSyncCursor(page.nextCursor, otherUserId), /Cursor de sincronização inválido/);
    const parts = page.nextCursor.split('.');
    parts[1] = `${parts[1][0] === 'A' ? 'B' : 'A'}${parts[1].slice(1)}`;
    await assert.rejects(service.pull(userId, parts.join('.'), 1), /Cursor de sincronização inválido/);
  });

  it('recusa bounds inválidos antes de consultar o feed', async () => {
    const service = new ContentSyncService(new MemoryContentSyncRepository());
    await assert.rejects(service.pull(crypto.randomUUID(), undefined, 0), (error: any) => error.statusCode === 400);
    await assert.rejects(service.pull(crypto.randomUUID(), undefined, 201), (error: any) => error.statusCode === 400);
  });

  it('não serializa gabaritos mesmo se um payload armazenado estiver contaminado', async () => {
    const userId = crypto.randomUUID();
    const repository = new MemoryContentSyncRepository();
    const now = new Date().toISOString();
    const questionId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    repository.changes.push({
      userId,
      sequence: 1n,
      entityType: ContentSyncEntityType.QUESTION,
      operation: ContentSyncOperation.UPSERT,
      entityId: questionId,
      parentId: subjectId,
      payload: {
        question: {
          id: questionId,
          subjectId,
          type: QuestionType.MULTIPLE_CHOICE,
          statement: 'Pergunta segura?',
          options: [{ id: crypto.randomUUID(), text: 'Opção', orderIndex: 0, isCorrect: true }],
          createdAt: now,
          updatedAt: now
        }
      },
      createdAt: new Date(now)
    });

    await assert.rejects(new ContentSyncService(repository).pull(userId), (error: unknown) => error instanceof ZodError);
  });
});
