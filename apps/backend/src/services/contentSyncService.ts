import { ContentSyncEntityType, ContentSyncOperation } from '@prisma/client';
import {
  contentSyncPageSchema,
  type ContentSyncChange,
  type ContentSyncPage,
  type SyncedFocus,
  type SyncedQuestion,
  type SyncedSubject
} from '@bokken/shared';
import { IContentSyncRepository, PrismaContentSyncRepository, ContentSyncRecord } from '../repositories/contentSyncRepository.js';
import { AppError } from '../utils/errors.js';
import { decodeContentSyncCursor, encodeContentSyncCursor } from './contentSyncCursor.js';

export const CONTENT_SYNC_DEFAULT_LIMIT = 100;
export const CONTENT_SYNC_MAX_LIMIT = 200;

function readPayload(record: ContentSyncRecord): Record<string, unknown> {
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
    throw new Error('Registro de sincronização sem payload válido.');
  }
  return record.payload as Record<string, unknown>;
}

function mapChange(record: ContentSyncRecord): ContentSyncChange {
  const sequence = record.sequence.toString();
  const payload = readPayload(record);

  if (record.operation === ContentSyncOperation.TOMBSTONE) {
    const deletedAt = payload.deletedAt;
    if (typeof deletedAt !== 'string') throw new Error('Tombstone sem data de exclusão válida.');
    if (record.entityType === ContentSyncEntityType.FOCUS) {
      return { kind: 'FOCUS_TOMBSTONE', sequence, id: record.entityId, deletedAt };
    }
    if (!record.parentId) throw new Error('Tombstone dependente sem parentId.');
    if (record.entityType === ContentSyncEntityType.SUBJECT) {
      return { kind: 'SUBJECT_TOMBSTONE', sequence, id: record.entityId, focusId: record.parentId, deletedAt };
    }
    return { kind: 'QUESTION_TOMBSTONE', sequence, id: record.entityId, subjectId: record.parentId, deletedAt };
  }

  if (record.entityType === ContentSyncEntityType.FOCUS) {
    const focus = payload.focus as SyncedFocus;
    if (focus?.id !== record.entityId) throw new Error('Payload de foco incompatível com o registro de sincronização.');
    return { kind: 'FOCUS_UPSERT', sequence, focus };
  }
  if (record.entityType === ContentSyncEntityType.SUBJECT) {
    const subject = payload.subject as SyncedSubject;
    if (!record.parentId || subject?.id !== record.entityId || subject.focusId !== record.parentId) throw new Error('Payload de matéria incompatível com o registro de sincronização.');
    return { kind: 'SUBJECT_UPSERT', sequence, subject };
  }
  const question = payload.question as SyncedQuestion;
  if (!record.parentId || question?.id !== record.entityId || question.subjectId !== record.parentId) throw new Error('Payload de pergunta incompatível com o registro de sincronização.');
  return { kind: 'QUESTION_UPSERT', sequence, question };
}

export class ContentSyncService {
  constructor(private readonly repository: IContentSyncRepository = new PrismaContentSyncRepository()) {}

  async pull(userId: string, cursorToken?: string, limit = CONTENT_SYNC_DEFAULT_LIMIT): Promise<ContentSyncPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > CONTENT_SYNC_MAX_LIMIT) {
      throw new AppError(`O limite deve ser um inteiro entre 1 e ${CONTENT_SYNC_MAX_LIMIT}.`, 400);
    }

    let after = 0n;
    let through = 0n;
    let complete = false;

    if (cursorToken) {
      const cursor = decodeContentSyncCursor(cursorToken, userId);
      after = BigInt(cursor.after);
      through = BigInt(cursor.through);
      complete = cursor.complete;

      if (complete) {
        const current = await this.repository.getLastSequence(userId);
        if (current > through) through = current;
      }
    } else {
      through = await this.repository.getLastSequence(userId);
    }

    const records = await this.repository.findChanges(userId, after, through, limit + 1);
    const hasMore = records.length > limit;
    const pageRecords = records.slice(0, limit);
    const nextAfter = hasMore && pageRecords.length > 0
      ? pageRecords[pageRecords.length - 1].sequence
      : through;
    const nextCursor = encodeContentSyncCursor({
      userId,
      after: nextAfter.toString(),
      through: through.toString(),
      complete: !hasMore
    });

    return contentSyncPageSchema.parse({
      changes: pageRecords.map(mapChange),
      nextCursor,
      hasMore
    });
  }
}
