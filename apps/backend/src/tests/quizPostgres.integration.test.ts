import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { DiscursiveAssessment, QuestionType, QuizMode, QuizQuestionStatus } from '@bokken/shared';
import { QuizService } from '../services/quizService.js';

const databaseUrl = process.env.QUIZ_TEST_DATABASE_URL;
describe('QuizService — integração PostgreSQL descartável', { skip: !databaseUrl }, () => {
  let db: PrismaClient;
  let service: QuizService;
  let userId = '';
  let focusId = '';
  let subjectId = '';
  let multipleChoiceQuestionId = '';
  let discursiveQuestionId = '';
  let options: Array<{ id: string; isCorrect: boolean }> = [];

  before(async () => {
    assert.ok(databaseUrl);
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//, '');
    assert.match(databaseName, /(?:test|disposable)/i, 'QUIZ_TEST_DATABASE_URL deve apontar para banco descartável com nome contendo test ou disposable');
    assert.notEqual(databaseName.toLowerCase(), 'bokken_db', 'O teste recusa o nome do banco de desenvolvimento');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const manifestColumns = await db.$queryRaw<Array<{ column_name: string }>>`SELECT "column_name" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quiz_session_questions'`;
    assert.ok(manifestColumns.some(row => row.column_name === 'sessionId'), 'A migração camelCase da tabela de manifesto deve estar aplicada');
    assert.ok(manifestColumns.some(row => row.column_name === 'snapshotVersion'));

    userId = crypto.randomUUID(); focusId = crypto.randomUUID(); subjectId = crypto.randomUUID();
    multipleChoiceQuestionId = crypto.randomUUID(); discursiveQuestionId = crypto.randomUUID();
    const correctId = crypto.randomUUID(); const wrongId = crypto.randomUUID();
    await db.user.create({ data: { id: userId, email: `quiz-${userId}@example.invalid`, name: 'Quiz integration', passwordHash: 'not-a-login', timezone: 'UTC' } });
    await db.focus.create({ data: { id: focusId, userId, name: 'Integration focus' } });
    await db.subject.create({ data: { id: subjectId, focusId, name: 'Integration subject' } });
    await db.question.create({ data: { id: multipleChoiceQuestionId, subjectId, type: QuestionType.MULTIPLE_CHOICE, statement: 'MC integration?', options: { create: [
      { id: correctId, text: 'Correct', isCorrect: true, orderIndex: 0 }, { id: wrongId, text: 'Wrong', isCorrect: false, orderIndex: 1 }
    ] } } });
    await db.question.create({ data: { id: discursiveQuestionId, subjectId, type: QuestionType.DISCURSIVE, statement: 'Explain integration.', expectedAnswer: 'Expected explanation.' } });
    options = [{ id: correctId, isCorrect: true }, { id: wrongId, isCorrect: false }];
    service = new QuizService(db);
  });

  after(async () => {
    if (!db) return;
    if (userId) {
      await db.questionAttempt.deleteMany({ where: { userId } });
      await db.quizSession.deleteMany({ where: { userId } });
      await db.question.deleteMany({ where: { subjectId } });
      await db.subject.deleteMany({ where: { focusId } });
      await db.focus.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  async function newSession(type: QuestionType = QuestionType.MULTIPLE_CHOICE) {
    return service.createSession(userId, { mode: QuizMode.FOCUS, focusId, types: [type], limit: null });
  }
  function answerBody(optionId: string, idempotencyKey = crypto.randomUUID(), timeSpentSeconds = 5) {
    return { type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: optionId, idempotencyKey, timeSpentSeconds };
  }

  it('cria relação e manifesto no schema migrado e rejeita chaves únicas duplicadas', async () => {
    const session = await newSession(); const entry = session.questions[0];
    assert.equal(entry.status, QuizQuestionStatus.PENDING);
    await assert.rejects(db.quizSessionQuestion.create({ data: {
      sessionId: session.id, questionId: entry.questionId, snapshot: entry.snapshot as any, position: 9
    } }), (error: any) => error.code === 'P2002');
    await assert.rejects(db.quizSessionQuestion.create({ data: {
      sessionId: crypto.randomUUID(), questionId: entry.questionId, snapshot: entry.snapshot as any, position: 0
    } }), (error: any) => error.code === 'P2003');
  });

  it('rejeita conclusão com pendentes, não devolve snapshot ao pular e permite revisão depois de concluir', async () => {
    const session = await newSession(); const entry = session.questions[0];
    await assert.rejects(service.complete(userId, session.id), (error: any) => error.statusCode === 409 && error.details.pendingCount === 1);
    const skipped = await service.skip(userId, session.id, entry.id);
    assert.deepEqual(Object.keys(skipped).sort(), ['id', 'position', 'skippedAt', 'status']);
    const active = await service.getSession(userId, session.id);
    assert.equal(active.questions[0].snapshot.options[0].isCorrect, undefined);
    const completed = await service.complete(userId, session.id);
    assert.ok(completed.finishedAt);
    assert.equal(completed.questions[0].snapshot.options.some(option => option.isCorrect === true), true);
    await assert.rejects(service.answer(userId, session.id, entry.id, answerBody(options[0].id)), (error: any) => error.statusCode === 409);
  });

  it('serializa respostas simultâneas com chaves diferentes para uma única tentativa', async () => {
    const session = await newSession(); const entry = session.questions[0];
    const results = await Promise.allSettled([
      service.answer(userId, session.id, entry.id, answerBody(options[0].id)),
      service.answer(userId, session.id, entry.id, answerBody(options[1].id))
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await db.questionAttempt.count({ where: { quizSessionId: session.id } }), 1);
    assert.equal((await db.quizSessionQuestion.findUniqueOrThrow({ where: { id: entry.id } })).status, QuizQuestionStatus.ANSWERED);
  });

  it('torna idempotente o reenvio simultâneo igual e conflita com payload diferente', async () => {
    const session = await newSession(); const entry = session.questions[0]; const key = crypto.randomUUID();
    const samePayload = answerBody(options[0].id, key);
    const sameResults = await Promise.all([
      service.answer(userId, session.id, entry.id, samePayload), service.answer(userId, session.id, entry.id, samePayload)
    ]);
    assert.equal(sameResults.filter(result => result.alreadyRecorded).length, 1);
    const replay = await service.answer(userId, session.id, entry.id, samePayload);
    assert.equal(replay.alreadyRecorded, true);
    assert.equal(replay.attempt.id, sameResults[0].attempt.id);
    assert.equal(await db.questionAttempt.count({ where: { quizSessionId: session.id } }), 1);
    await assert.rejects(service.answer(userId, session.id, entry.id, answerBody(options[1].id, key)), (error: any) => error.statusCode === 409);
    await assert.rejects(service.answer(userId, session.id, entry.id, answerBody(options[1].id)), (error: any) => error.statusCode === 409);
  });

  it('faz responder e pular concorrer por uma única transição e mantém tentativa e estado alinhados', async () => {
    const session = await newSession(); const entry = session.questions[0];
    const results = await Promise.allSettled([
      service.answer(userId, session.id, entry.id, answerBody(options[0].id)), service.skip(userId, session.id, entry.id)
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const state = await db.quizSessionQuestion.findUniqueOrThrow({ where: { id: entry.id } });
    const attempts = await db.questionAttempt.count({ where: { quizSessionId: session.id } });
    assert.equal(state.status === QuizQuestionStatus.ANSWERED ? attempts : state.status === QuizQuestionStatus.SKIPPED && attempts === 0, true);
  });

  it('revela apenas resposta discursiva ao proprietário e devolve 404 para outro usuário', async () => {
    const session = await newSession(QuestionType.DISCURSIVE); const entry = session.questions[0];
    const revealed = await service.revealDiscursiveAnswer(userId, session.id, entry.id);
    assert.equal(revealed.expectedAnswer, 'Expected explanation.');
    assert.equal('options' in revealed, false);
    await assert.rejects(service.getSession(crypto.randomUUID(), session.id), (error: any) => error.statusCode === 404);
    await assert.rejects(service.revealDiscursiveAnswer(crypto.randomUUID(), session.id, entry.id), (error: any) => error.statusCode === 404);
    const mcSession = await newSession();
    await assert.rejects(service.revealDiscursiveAnswer(userId, mcSession.id, mcSession.questions[0].id), (error: any) => error.statusCode === 400);
  });

  it('persiste autoavaliação discursiva e resultado coerentes com o tipo', async () => {
    const session = await newSession(QuestionType.DISCURSIVE); const entry = session.questions[0];
    const result = await service.answer(userId, session.id, entry.id, {
      type: QuestionType.DISCURSIVE, assessment: DiscursiveAssessment.INCORRECT,
      idempotencyKey: crypto.randomUUID(), timeSpentSeconds: 7
    });
    assert.equal(result.attempt.isCorrect, false);
    assert.equal(result.attempt.discursiveAssessment, DiscursiveAssessment.INCORRECT);
    const stored = await db.questionAttempt.findUniqueOrThrow({ where: { id: result.attempt.id } });
    assert.equal(stored.selectedOptionId, null);
    assert.equal(stored.discursiveAssessment, DiscursiveAssessment.INCORRECT);
    assert.equal(stored.isCorrect, false);
  });

  it('serializa conclusão contra resposta simultânea e nunca deixa item pendente em sessão concluída', async () => {
    const session = await newSession(); const entry = session.questions[0];
    const results = await Promise.allSettled([
      service.answer(userId, session.id, entry.id, answerBody(options[0].id)),
      service.complete(userId, session.id)
    ]);
    const latest = await service.getSession(userId, session.id);
    if (latest.finishedAt) {
      assert.equal(latest.questions.some(question => question.status === QuizQuestionStatus.PENDING), false);
    } else {
      assert.equal(results[0].status, 'fulfilled');
      assert.equal(results[1].status, 'rejected');
      const completed = await service.complete(userId, session.id);
      assert.ok(completed.finishedAt);
    }
  });

  it('rollback mantém a pergunta pendente se a persistência da tentativa falhar', async () => {
    const session = await newSession(); const entry = session.questions[0]; const selected = entry.snapshot.options[0].id;
    await db.questionOption.delete({ where: { id: selected } });
    await assert.rejects(service.answer(userId, session.id, entry.id, answerBody(selected)), (error: any) => error.code === 'P2003');
    assert.equal((await db.quizSessionQuestion.findUniqueOrThrow({ where: { id: entry.id } })).status, QuizQuestionStatus.PENDING);
    assert.equal(await db.questionAttempt.count({ where: { quizSessionId: session.id } }), 0);
  });
});
