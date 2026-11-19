import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { QuestionType } from '@bokken/shared';
import { FocusService } from '../services/focusService.js';
import { SubjectService } from '../services/subjectService.js';
import { QuestionService } from '../services/questionService.js';
import { ContentSyncService } from '../services/contentSyncService.js';
import { ContentSyncController } from '../controllers/contentSyncController.js';
import { createSyncRouter } from '../routes/sync.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { generateToken } from '../utils/jwt.js';

const databaseUrl = process.env.QUIZ_TEST_DATABASE_URL;

describe('Content sync — integração PostgreSQL descartável', { skip: !databaseUrl }, () => {
  let db: PrismaClient;
  let syncService: ContentSyncService;
  let userId = '';
  let otherUserId = '';

  before(async () => {
    assert.ok(databaseUrl);
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//, '');
    assert.match(databaseName, /(?:test|disposable)/i, 'A integração deve usar banco descartável.');
    assert.notEqual(databaseName.toLowerCase(), 'bokken_db', 'A integração recusa o banco de desenvolvimento.');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();

    const tables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('content_sync_states', 'content_sync_changes')
    `;
    assert.equal(tables.length, 2, 'As tabelas da migração de sincronização devem existir.');

    userId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    await db.user.createMany({ data: [
      { id: userId, email: `sync-${userId}@example.invalid`, name: 'Sync owner', passwordHash: 'not-a-login', timezone: 'UTC' },
      { id: otherUserId, email: `sync-${otherUserId}@example.invalid`, name: 'Other owner', passwordHash: 'not-a-login', timezone: 'UTC' }
    ] });
    syncService = new ContentSyncService();
  });

  after(async () => {
    if (!db) return;
    if (userId) {
      await db.question.deleteMany({ where: { subject: { focus: { userId: { in: [userId, otherUserId] } } } } });
      await db.subject.deleteMany({ where: { focus: { userId: { in: [userId, otherUserId] } } } });
      await db.focus.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    }
    await db.$disconnect();
  });

  it('sincroniza inicial/incremental, fixa watermark entre páginas, inclui tombstones e não expõe gabarito', async () => {
    const focusService = new FocusService();
    const subjectService = new SubjectService();
    const questionService = new QuestionService();
    const focus = await focusService.createFocus(userId, { name: 'Conteúdo sincronizado', description: 'Descrição', color: '#123456' });
    const subject = await subjectService.createSubject(userId, { focusId: focus.id, name: 'Matéria sincronizada' });
    const question = await questionService.createQuestion(userId, {
      subjectId: subject.id,
      type: QuestionType.MULTIPLE_CHOICE,
      statement: 'Qual alternativa é correta?',
      explanation: 'Justificativa secreta.',
      expectedAnswer: 'Resposta esperada secreta.',
      options: [
        { text: 'Resposta correta secreta', isCorrect: true },
        { text: 'Resposta incorreta', isCorrect: false }
      ]
    });

    const first = await syncService.pull(userId, undefined, 2);
    assert.deepEqual(first.changes.map(change => change.kind), ['FOCUS_UPSERT', 'SUBJECT_UPSERT']);
    assert.equal(first.hasMore, true);
    const concurrentFocus = await focusService.createFocus(userId, { name: 'Criado durante a sincronização' });
    const second = await syncService.pull(userId, first.nextCursor, 2);
    assert.equal(second.changes.length, 1);
    assert.equal(second.hasMore, false);
    const questionChange = second.changes[0];
    assert.equal(questionChange.kind, 'QUESTION_UPSERT');
    if (questionChange.kind === 'QUESTION_UPSERT') {
      assert.equal(questionChange.question.statement, question.statement);
      assert.equal(questionChange.question.options.length, 2);
      assert.equal(JSON.stringify(questionChange).includes('isCorrect'), false);
      assert.equal(JSON.stringify(questionChange).includes('Justificativa secreta'), false);
      assert.equal(JSON.stringify(questionChange).includes('Resposta esperada secreta'), false);
      assert.equal(questionChange.question.options.some(option => option.text === 'Resposta correta secreta'), true,
        'O texto das alternativas é necessário para responder, mas o sinalizador da opção correta nunca é enviado.');
    }

    const afterSync = await syncService.pull(userId, second.nextCursor, 10);
    assert.equal(afterSync.changes.length, 1);
    assert.equal(afterSync.changes[0].kind, 'FOCUS_UPSERT');
    if (afterSync.changes[0].kind === 'FOCUS_UPSERT') assert.equal(afterSync.changes[0].focus.id, concurrentFocus.id);

    const updatedFocus = await focusService.updateFocus(focus.id, userId, { name: 'Foco atualizado' });
    assert.equal(updatedFocus.name, 'Foco atualizado');
    const incremental = await syncService.pull(userId, afterSync.nextCursor, 10);
    assert.equal(incremental.changes.length, 1);
    assert.equal(incremental.changes[0].kind, 'FOCUS_UPSERT');

    await focusService.deleteFocus(focus.id, userId);
    const deletionPage = await syncService.pull(userId, incremental.nextCursor, 10);
    assert.deepEqual(deletionPage.changes.map(change => change.kind), [
      'QUESTION_TOMBSTONE', 'SUBJECT_TOMBSTONE', 'FOCUS_TOMBSTONE'
    ]);
  });

  it('isola alterações por proprietário e valida JWT, cursor e parâmetros da rota', async () => {
    const focus = await new FocusService().createFocus(otherUserId, { name: 'Somente outro usuário' });
    const privatePage = await syncService.pull(otherUserId, undefined, 10);
    assert.equal(privatePage.changes.some(change => change.kind === 'FOCUS_UPSERT' && change.focus.id === focus.id), true);
    const ownerPage = await syncService.pull(userId, undefined, 10);
    assert.equal(ownerPage.changes.some(change => change.kind === 'FOCUS_UPSERT' && change.focus.id === focus.id), false);
    await assert.rejects(syncService.pull(otherUserId, ownerPage.nextCursor), (error: any) => error.statusCode === 400);

    const app = express();
    app.use('/api/sync', createSyncRouter(new ContentSyncController(syncService)));
    app.use(errorHandler);
    const server = app.listen(0);
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const baseUrl = `http://127.0.0.1:${address.port}/api/sync/content`;
      const unauthenticated = await fetch(baseUrl);
      assert.equal(unauthenticated.status, 401);

      const tokenA = generateToken({ userId, email: 'owner@example.invalid' });
      const tokenB = generateToken({ userId: otherUserId, email: 'other@example.invalid' });
      const invalidLimit = await fetch(`${baseUrl}?limit=0`, { headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(invalidLimit.status, 400);
      const invalidCursor = await fetch(`${baseUrl}?cursor=alterado`, { headers: { authorization: `Bearer ${tokenB}` } });
      assert.equal(invalidCursor.status, 400);
      const valid = await fetch(`${baseUrl}?limit=10`, { headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(valid.status, 200);
      const response = await valid.json() as { changes: Array<{ focus?: { id: string } }> };
      assert.equal(response.changes.some(change => change.focus?.id === focus.id), false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
