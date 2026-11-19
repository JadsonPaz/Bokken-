import 'fake-indexeddb/auto';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { QuestionType, QuizMode, type ContentSyncPage, type SafeUser } from '@bokken/shared';
import { enqueueForActiveAccount, createOperationId } from '../db/outbox.js';
import { ActiveAccountChangedError, applyContentSyncPageForActiveAccount, StaleContentSyncPageError } from '../db/contentSync.js';
import { BokkenDatabase, type LocalSession } from '../db/index.js';
import { pullNextContentPageForActiveAccount } from '../services/contentSync.js';

const openDatabases: BokkenDatabase[] = [];

function makeDatabase() {
  const database = new BokkenDatabase(`BokkenContentSync-${crypto.randomUUID()}`);
  openDatabases.push(database);
  return database;
}

function localSession(userId: string, token = `token-${userId}`): LocalSession {
  const user: SafeUser = {
    id: userId,
    name: `Usuário ${userId}`,
    email: `${userId}@example.invalid`,
    timezone: 'UTC',
    createdAt: new Date().toISOString()
  };
  return { key: 'active_session', userId, token, user, savedAt: Date.now() };
}

function page(changes: ContentSyncPage['changes'], nextCursor = 'opaque-next-cursor', hasMore = false): ContentSyncPage {
  return { changes, nextCursor, hasMore };
}

afterEach(async () => {
  const databases = openDatabases.splice(0);
  const names = databases.map(database => database.name);
  for (const database of databases) database.close();
  for (const name of names) await Dexie.delete(name);
});

describe('Pull incremental de conteúdo no IndexedDB', () => {
  it('persiste a página, cursor e tombstones apenas na conta ativa, preservando quiz e outbox', async () => {
    const database = makeDatabase();
    const accountA = crypto.randomUUID();
    const accountB = crypto.randomUUID();
    const focusId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await database.session.put(localSession(accountA, 'token-A'));
    await database.foci.put({ userId: accountB, id: focusId, name: 'Foco de B', description: null, color: null, createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });
    await database.subjects.put({ userId: accountB, id: subjectId, focusId, name: 'Matéria de B', description: null, createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });
    await database.questions.put({ userId: accountB, id: questionId, subjectId, type: QuestionType.MULTIPLE_CHOICE, statement: 'Questão de B?', options: [], createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });

    const operationId = createOperationId();
    const operation = await enqueueForActiveAccount({
      id: operationId,
      idempotencyKey: operationId,
      operation: 'COMPLETE_SESSION',
      sessionId: crypto.randomUUID()
    }, database);
    const quizId = crypto.randomUUID();
    await database.quizSessions.put({ userId: accountA, id: quizId, mode: QuizMode.SUBJECT, totalQuestions: 1, startedAt: now, finishedAt: null, createdAt: now, updatedAt: now, state: 'ACTIVE', cachedAt: Date.now() });

    const received: ContentSyncPage = page([
      { kind: 'FOCUS_UPSERT', sequence: '1', focus: { id: focusId, name: 'Foco de A', description: null, color: '#123456', createdAt: now, updatedAt: now } },
      { kind: 'SUBJECT_UPSERT', sequence: '2', subject: { id: subjectId, focusId, name: 'Matéria de A', description: null, createdAt: now, updatedAt: now } },
      { kind: 'QUESTION_UPSERT', sequence: '3', question: { id: questionId, subjectId, type: QuestionType.MULTIPLE_CHOICE, statement: 'Pergunta sem gabarito?', options: [{ id: crypto.randomUUID(), text: 'Alternativa visível', orderIndex: 0 }], createdAt: now, updatedAt: now } }
    ], 'opaque-content-1');
    const first = await pullNextContentPageForActiveAccount(async (token, cursor, limit) => {
      assert.equal(token, 'token-A');
      assert.equal(cursor, null);
      assert.equal(limit, 100);
      return received;
    }, database);

    assert.equal(first.changes.length, 3);
    assert.equal((await database.foci.get([accountA, focusId]))?.name, 'Foco de A');
    assert.equal((await database.foci.get([accountB, focusId]))?.name, 'Foco de B');
    const cachedQuestion = await database.questions.get([accountA, questionId]);
    assert.equal(cachedQuestion?.options[0].text, 'Alternativa visível');
    assert.equal('isCorrect' in cachedQuestion!.options[0], false);
    assert.equal(await database.quizSessions.get([accountA, quizId]) !== undefined, true);
    assert.equal((await database.outbox.get([accountA, operation.id]))?.status, 'PENDING_SYNC');

    await pullNextContentPageForActiveAccount(async (_token, cursor) => {
      assert.equal(cursor, 'opaque-content-1');
      return page([
        { kind: 'QUESTION_TOMBSTONE', sequence: '4', id: questionId, subjectId, deletedAt: now },
        { kind: 'SUBJECT_TOMBSTONE', sequence: '5', id: subjectId, focusId, deletedAt: now },
        { kind: 'FOCUS_TOMBSTONE', sequence: '6', id: focusId, deletedAt: now }
      ], 'opaque-content-2');
    }, database);

    assert.equal(await database.questions.get([accountA, questionId]), undefined);
    assert.equal(await database.subjects.get([accountA, subjectId]), undefined);
    assert.equal(await database.foci.get([accountA, focusId]), undefined);
    assert.equal((await database.questions.get([accountB, questionId]))?.statement, 'Questão de B?');
    assert.equal((await database.syncCursors.get([accountA, 'content']))?.cursor, 'opaque-content-2');

    database.close();
    const reloaded = new BokkenDatabase(database.name);
    openDatabases.push(reloaded);
    await reloaded.open();
    assert.equal((await reloaded.syncCursors.get([accountA, 'content']))?.cursor, 'opaque-content-2');
    assert.equal((await reloaded.outbox.get([accountA, operation.id]))?.status, 'PENDING_SYNC');
  });

  it('interrupção de rede não avança o cursor e nova chamada retoma do mesmo ponto', async () => {
    const database = makeDatabase();
    const userId = crypto.randomUUID();
    await database.session.put(localSession(userId));
    await assert.rejects(
      pullNextContentPageForActiveAccount(async () => { throw new Error('rede interrompida'); }, database),
      /rede interrompida/
    );
    assert.equal(await database.syncCursors.get([userId, 'content']), undefined);

    const now = new Date().toISOString();
    await pullNextContentPageForActiveAccount(async (_token, cursor) => {
      assert.equal(cursor, null);
      return page([{ kind: 'FOCUS_UPSERT', sequence: '1', focus: { id: crypto.randomUUID(), name: 'Retomado', description: null, color: null, createdAt: now, updatedAt: now } }], 'opaque-recovered');
    }, database);
    assert.equal((await database.syncCursors.get([userId, 'content']))?.cursor, 'opaque-recovered');
  });

  it('aborta gravação se a conta mudar enquanto a requisição está em andamento', async () => {
    const database = makeDatabase();
    const accountA = crypto.randomUUID();
    const accountB = crypto.randomUUID();
    const focusId = crypto.randomUUID();
    const now = new Date().toISOString();
    await database.session.put(localSession(accountA));

    await assert.rejects(
      pullNextContentPageForActiveAccount(async () => {
        await database.session.put(localSession(accountB));
        return page([{ kind: 'FOCUS_UPSERT', sequence: '1', focus: { id: focusId, name: 'Privado de A', description: null, color: null, createdAt: now, updatedAt: now } }]);
      }, database),
      ActiveAccountChangedError
    );
    assert.equal(await database.foci.get([accountA, focusId]), undefined);
    assert.equal(await database.foci.get([accountB, focusId]), undefined);
    assert.equal(await database.syncCursors.get([accountA, 'content']), undefined);
  });

  it('recusa uma página antiga se outra sincronização já avançou o cursor', async () => {
    const database = makeDatabase();
    const userId = crypto.randomUUID();
    await database.session.put(localSession(userId));
    await database.syncCursors.put({ userId, scope: 'content', cursor: 'newer-cursor', updatedAt: Date.now() });
    const now = new Date().toISOString();
    await assert.rejects(
      applyContentSyncPageForActiveAccount(userId, null, page([
        { kind: 'FOCUS_UPSERT', sequence: '1', focus: { id: crypto.randomUUID(), name: 'Stale', description: null, color: null, createdAt: now, updatedAt: now } }
      ]), database),
      StaleContentSyncPageError
    );
    assert.equal(await database.foci.where('userId').equals(userId).count(), 0);
    assert.equal((await database.syncCursors.get([userId, 'content']))?.cursor, 'newer-cursor');
  });
});
