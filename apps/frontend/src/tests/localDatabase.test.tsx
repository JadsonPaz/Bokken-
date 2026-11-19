import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { afterEach, describe, it } from 'node:test';
import { DiscursiveAssessment, QuestionType, QuizMode, QuizQuestionStatus, type SafeUser } from '@bokken/shared';
import { BokkenDatabase, type LocalSession } from '../db/index.js';
import {
  claimPendingForActiveAccount,
  createOperationId,
  enqueueForActiveAccount,
  recoverStaleProcessingForActiveAccount,
  transitionForActiveAccount
} from '../db/outbox.js';

const openedDatabases: BokkenDatabase[] = [];

function newDatabase() {
  const database = new BokkenDatabase(`BokkenLocalDB-test-${crypto.randomUUID()}`);
  openedDatabases.push(database);
  return database;
}

function localSession(userId: string, token = `token-${userId}`): LocalSession {
  const user: SafeUser = {
    id: userId,
    name: `User ${userId}`,
    email: `${userId}@example.invalid`,
    timezone: 'UTC',
    createdAt: new Date().toISOString()
  };
  return { key: 'active_session', userId, token, user, savedAt: Date.now() };
}

async function createAnswerOperation(database: BokkenDatabase, sessionId = crypto.randomUUID()) {
  const id = createOperationId();
  return enqueueForActiveAccount({
    id,
    idempotencyKey: id,
    operation: 'ANSWER_QUESTION',
    sessionId,
    sessionQuestionId: crypto.randomUUID(),
    answer: { type: QuestionType.DISCURSIVE, assessment: DiscursiveAssessment.CORRECT, timeSpentSeconds: 8 }
  }, database);
}

afterEach(async () => {
  const databases = openedDatabases.splice(0);
  const names = new Set(databases.map(database => database.name));
  for (const database of databases) database.close();
  for (const name of names) await Dexie.delete(name);
});

describe('Dexie — contratos locais e isolamento da outbox', () => {
  it('migra o schema v1 sem perder a sessão existente', async () => {
    const name = `BokkenLocalDB-migration-${crypto.randomUUID()}`;
    const priorSession = localSession(crypto.randomUUID(), 'legacy-token');
    const legacy = new Dexie(name);
    legacy.version(1).stores({ session: 'key, userId' });
    await legacy.table('session').put(priorSession);
    legacy.close();

    const migrated = new BokkenDatabase(name);
    openedDatabases.push(migrated);
    await migrated.open();

    assert.deepEqual(await migrated.session.get('active_session'), priorSession);
    assert.deepEqual(
      migrated.tables.map(table => table.name).sort(),
      ['foci', 'outbox', 'questions', 'quizSessionQuestions', 'quizSessions', 'session', 'subjects', 'syncCursors'].sort()
    );
    assert.equal(migrated.verno, 2);
  });

  it('cria e recupera conteúdo, manifesto e cursor por conta usando datas de API ISO', async () => {
    const database = newDatabase();
    const userId = crypto.randomUUID();
    const focusId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const sessionQuestionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await database.foci.put({ userId, id: focusId, name: 'Foco', description: null, color: null, createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });
    await database.subjects.put({ userId, id: subjectId, focusId, name: 'Matéria', description: null, createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });
    await database.questions.put({
      userId, id: questionId, subjectId, type: QuestionType.MULTIPLE_CHOICE, statement: 'Pergunta',
      options: [{ id: crypto.randomUUID(), text: 'Alternativa', orderIndex: 0 }],
      createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now()
    });
    await database.quizSessions.put({ userId, id: sessionId, mode: QuizMode.SUBJECT, totalQuestions: 1, startedAt: now, finishedAt: null, createdAt: now, updatedAt: now, state: 'ACTIVE', cachedAt: Date.now() });
    await database.quizSessionQuestions.put({
      userId, id: sessionQuestionId, sessionId, questionId, position: 0, status: QuizQuestionStatus.PENDING,
      snapshotVersion: 1, snapshot: { type: QuestionType.MULTIPLE_CHOICE, statement: 'Snapshot', options: [] },
      answeredAt: null, skippedAt: null, attempt: null, cachedAt: Date.now()
    });
    await database.syncCursors.put({ userId, scope: 'content', cursor: 'opaque-server-cursor', updatedAt: Date.now() });

    assert.equal((await database.foci.get([userId, focusId]))?.name, 'Foco');
    assert.equal((await database.subjects.get([userId, subjectId]))?.focusId, focusId);
    assert.equal((await database.questions.get([userId, questionId]))?.options[0].text, 'Alternativa');
    assert.equal((await database.quizSessionQuestions.get([userId, sessionQuestionId]))?.status, QuizQuestionStatus.PENDING);
    assert.equal((await database.syncCursors.get([userId, 'content']))?.cursor, 'opaque-server-cursor');
  });

  it('permite o mesmo ID lógico em contas distintas e cada consulta composta retorna somente o dono', async () => {
    const database = newDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = (userId: string, name: string) => ({ userId, id, name, description: null, color: null, createdAt: now, updatedAt: now, deletedAt: null, cachedAt: Date.now() });
    await database.foci.bulkPut([row('account-a', 'A'), row('account-b', 'B')]);

    assert.equal((await database.foci.get(['account-a', id]))?.name, 'A');
    assert.equal((await database.foci.get(['account-b', id]))?.name, 'B');
    assert.equal(await database.foci.get(['account-c', id]), undefined);
  });

  it('preserva a outbox em reload, logout e troca de conta; nunca empacota operações de outra conta com o token ativo', async () => {
    const database = newDatabase();
    const accountA = crypto.randomUUID();
    const accountB = crypto.randomUUID();
    await database.session.put(localSession(accountA, 'token-A'));
    const operationA = await createAnswerOperation(database);

    database.close();
    const reopened = new BokkenDatabase(database.name);
    openedDatabases.push(reopened);
    await reopened.open();
    assert.equal((await reopened.outbox.get([accountA, operationA.id]))?.status, 'PENDING_SYNC');

    await reopened.session.put(localSession(accountB, 'token-B'));
    const operationB = await createAnswerOperation(reopened);
    const batchB = await claimPendingForActiveAccount(10, reopened);
    assert.equal(batchB?.userId, accountB);
    assert.equal(batchB?.token, 'token-B');
    assert.deepEqual(batchB?.operations.map(operation => operation.id), [operationB.id]);
    assert.equal((await reopened.outbox.get([accountA, operationA.id]))?.status, 'PENDING_SYNC');

    await reopened.session.delete('active_session');
    assert.equal(await claimPendingForActiveAccount(10, reopened), null);
    assert.equal((await reopened.outbox.get([accountA, operationA.id]))?.status, 'PENDING_SYNC');
    assert.equal((await reopened.outbox.get([accountB, operationB.id]))?.status, 'PROCESSING');

    await reopened.session.put(localSession(accountA, 'token-A-again'));
    const batchA = await claimPendingForActiveAccount(10, reopened);
    assert.equal(batchA?.userId, accountA);
    assert.equal(batchA?.token, 'token-A-again');
    assert.deepEqual(batchA?.operations.map(operation => operation.id), [operationA.id]);
  });

  it('mantém operações após expiração/401 e aplica transições válidas, replay e recuperação de processamento', async () => {
    const database = newDatabase();
    const userId = crypto.randomUUID();
    await database.session.put(localSession(userId));
    const operation = await createAnswerOperation(database);
    const batch = await claimPendingForActiveAccount(10, database);
    assert.equal(batch?.operations[0].status, 'PROCESSING');

    assert.equal(await transitionForActiveAccount(operation.id, 'PROCESSING', 'PENDING_SYNC', { error: '401: reautenticação necessária' }, database), true);
    assert.equal((await database.outbox.get([userId, operation.id]))?.status, 'PENDING_SYNC');
    await assert.rejects(transitionForActiveAccount(operation.id, 'PENDING_SYNC', 'SYNCED', {}, database), /Transição inválida/);

    await claimPendingForActiveAccount(10, database);
    assert.equal(await transitionForActiveAccount(operation.id, 'PROCESSING', 'SYNCED', {}, database), true);
    const synced = await database.outbox.get([userId, operation.id]);
    assert.equal(synced?.status, 'SYNCED');
    assert.ok(synced?.syncedAt);
    await assert.rejects(transitionForActiveAccount(operation.id, 'SYNCED', 'PROCESSING', {}, database), /Transição inválida/);
    await assert.rejects(transitionForActiveAccount(operation.id, 'SYNCED', 'PENDING_SYNC', {}, database), /Transição inválida/);

    const interrupted = await createAnswerOperation(database);
    await claimPendingForActiveAccount(10, database);
    assert.equal(await recoverStaleProcessingForActiveAccount(Date.now() + 1, database), 1);
    assert.equal((await database.outbox.get([userId, interrupted.id]))?.status, 'PENDING_SYNC');

    const conflicted = await createAnswerOperation(database);
    await claimPendingForActiveAccount(10, database);
    assert.equal(await transitionForActiveAccount(conflicted.id, 'PROCESSING', 'CONFLICT', { error: 'A sessão já foi concluída.' }, database), true);
    assert.equal((await database.outbox.get([userId, conflicted.id]))?.status, 'CONFLICT');

    await database.session.delete('active_session');
    await assert.rejects(createAnswerOperation(database), /sessão autenticada local ativa/);
  });
});
