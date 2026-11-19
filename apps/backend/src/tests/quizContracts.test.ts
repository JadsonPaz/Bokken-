import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuizSummary, createQuizSessionSchema, DiscursiveAssessment, QuestionSnapshot, QuestionType, QuizMode, QuizQuestionStatus, QuizSessionDetail, submitQuizAnswerSchema } from '@bokken/shared';
import { evaluateAnswer, projectAttemptFeedback, projectQuizSession, projectSkippedQuestion, projectSnapshot } from '../services/quizService.js';

describe('Contratos de sessão e resposta do quiz', () => {
  it('exige escopo coerente com o modo e rejeita campos extras', () => {
    assert.equal(createQuizSessionSchema.safeParse({ mode: QuizMode.FOCUS, focusId: crypto.randomUUID(), types: [QuestionType.DISCURSIVE], limit: null }).success, true);
    assert.equal(createQuizSessionSchema.safeParse({ mode: QuizMode.FOCUS }).success, false);
    assert.equal(createQuizSessionSchema.safeParse({ mode: QuizMode.GENERAL_ALL, userId: crypto.randomUUID() }).success, false);
    assert.equal(createQuizSessionSchema.safeParse({ mode: QuizMode.GENERAL_CUSTOM, focusIds: [crypto.randomUUID()] }).success, false);
  });

  it('aceita apenas resposta coerente com discriminador, e nunca recebe isCorrect, snapshot ou userId', () => {
    const common = { idempotencyKey: crypto.randomUUID(), timeSpentSeconds: 10 };
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID() }).success, true);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.DISCURSIVE, assessment: DiscursiveAssessment.CORRECT }).success, true);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.DISCURSIVE, selectedOptionId: crypto.randomUUID() }).success, false);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID(), isCorrect: true }).success, false);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID(), questionSnapshot: {} }).success, false);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID(), userId: crypto.randomUUID() }).success, false);
    assert.equal(submitQuizAnswerSchema.safeParse({ ...common, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID(), clientStudyDate: '1900-01-01' }).success, false);
  });

  it('não expõe gabarito no snapshot de pergunta pendente e revela todas as alternativas depois da resposta', () => {
    const snapshot = { type: QuestionType.MULTIPLE_CHOICE, statement: 'Pergunta válida', explanation: null, expectedAnswer: null, options: [
      { id: crypto.randomUUID(), text: 'A', isCorrect: true, orderIndex: 0 }, { id: crypto.randomUUID(), text: 'B', isCorrect: false, orderIndex: 1 }
    ] } as QuestionSnapshot;
    const hidden = projectSnapshot(snapshot, false);
    assert.equal('isCorrect' in hidden.options[0], false);
    assert.equal(hidden.expectedAnswer, null);
    assert.equal(hidden.explanation, null);
    const revealed = projectSnapshot(snapshot, true);
    assert.equal(revealed.options[0].isCorrect, true);
    assert.equal(revealed.options.length, 2);
  });

  it('calcula escolha múltipla e avaliação discursiva a partir dos contratos corretos', () => {
    const rightId = crypto.randomUUID();
    const snapshot: QuestionSnapshot = { type: QuestionType.MULTIPLE_CHOICE, statement: 'Pergunta', options: [
      { id: rightId, text: 'Certa', isCorrect: true, orderIndex: 0 }, { id: crypto.randomUUID(), text: 'Errada', isCorrect: false, orderIndex: 1 }
    ] };
    const base = { idempotencyKey: crypto.randomUUID(), timeSpentSeconds: 1 };
    const mc = submitQuizAnswerSchema.parse({ ...base, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: rightId });
    assert.equal(evaluateAnswer(snapshot, mc).isCorrect, true);
    const discursive: QuestionSnapshot = { type: QuestionType.DISCURSIVE, statement: 'Pergunta discursiva', expectedAnswer: 'Resposta', options: [] };
    const selfAssessment = submitQuizAnswerSchema.parse({ ...base, type: QuestionType.DISCURSIVE, assessment: DiscursiveAssessment.INCORRECT });
    assert.equal(evaluateAnswer(discursive, selfAssessment).isCorrect, false);
    assert.equal(evaluateAnswer(discursive, selfAssessment).discursiveAssessment, DiscursiveAssessment.INCORRECT);
    assert.throws(() => evaluateAnswer(discursive, mc), /incompatível/);
    assert.throws(() => evaluateAnswer(snapshot, submitQuizAnswerSchema.parse({ ...base, type: QuestionType.MULTIPLE_CHOICE, selectedOptionId: crypto.randomUUID() })), /não pertence/);
  });

  it('projeta a sessão sem gabarito para pendentes/puladas e revela revisão somente após resposta ou conclusão', () => {
    const userId = crypto.randomUUID(); const sessionId = crypto.randomUUID(); const questionId = crypto.randomUUID();
    const optionId = crypto.randomUUID(); const now = new Date('2026-11-07T12:00:00Z');
    const fullSnapshot: QuestionSnapshot = { type: QuestionType.MULTIPLE_CHOICE, statement: 'Enunciado', explanation: 'Explicação', options: [
      { id: optionId, text: 'Alternativa correta', isCorrect: true, orderIndex: 0 }, { id: crypto.randomUUID(), text: 'Errada', isCorrect: false, orderIndex: 1 }
    ] };
    const session = {
      id: sessionId, userId, mode: QuizMode.FOCUS, totalQuestions: 3, totalCorrect: 0, totalIncorrect: 0, durationSeconds: 1,
      startedAt: now, finishedAt: null, createdAt: now, updatedAt: now,
      questions: [QuizQuestionStatus.PENDING, QuizQuestionStatus.SKIPPED, QuizQuestionStatus.ANSWERED].map((status, position) => ({
        id: crypto.randomUUID(), sessionId, questionId: crypto.randomUUID(), snapshot: fullSnapshot, snapshotVersion: 1, position, status,
        answeredAt: status === QuizQuestionStatus.ANSWERED ? now : null, skippedAt: status === QuizQuestionStatus.SKIPPED ? now : null,
        sensitiveColumnNotForDto: 'do not expose'
      }))
    };
    const answeredQuestionId = session.questions[2].questionId;
    const projected = projectQuizSession(session, [{
      id: crypto.randomUUID(), questionId: answeredQuestionId, userId, quizSessionId: sessionId, isCorrect: true,
      selectedOptionId: optionId, selectedOptionTextSnapshot: 'Alternativa correta', discursiveAssessment: null,
      timeSpentSeconds: 3, clientCreatedAt: now, questionSnapshot: fullSnapshot, syncedAt: now
    }]);
    assert.equal(projected.questions[0].snapshot.options[0].isCorrect, undefined);
    assert.equal(projected.questions[0].snapshot.explanation, null);
    assert.equal(projected.questions[1].snapshot.options[0].isCorrect, undefined);
    assert.equal(projected.questions[2].snapshot.options[0].isCorrect, true);
    assert.equal(projected.questions[2].attempt?.isCorrect, true);
    assert.equal('userId' in projected.questions[2].attempt!, false);
    assert.equal('sensitiveColumnNotForDto' in (projected.questions[2] as object), false);

    const completed = projectQuizSession({ ...session, finishedAt: now }, []);
    assert.equal(completed.questions[1].snapshot.options[0].isCorrect, true);
    const skipped = projectSkippedQuestion({ id: session.questions[1].id, position: 1 }, now);
    assert.deepEqual(Object.keys(skipped).sort(), ['id', 'position', 'skippedAt', 'status']);
    assert.equal('snapshot' in skipped, false);
  });

  it('projeta tentativa sem campos internos e sem snapshot Prisma aninhado', () => {
    const now = new Date();
    const dto = projectAttemptFeedback({ id: 'id', questionId: 'qid', userId: 'uid', quizSessionId: 'sid', isCorrect: false,
      selectedOptionId: null, selectedOptionTextSnapshot: null, discursiveAssessment: DiscursiveAssessment.INCORRECT,
      timeSpentSeconds: 1, clientCreatedAt: now, questionSnapshot: { secret: true }, syncedAt: now });
    assert.deepEqual(Object.keys(dto).sort(), ['clientCreatedAt', 'discursiveAssessment', 'id', 'isCorrect', 'questionId', 'selectedOptionId', 'selectedOptionTextSnapshot', 'timeSpentSeconds']);
  });

  it('calcula o percentual apenas sobre respondidas e exclui puladas do acerto/erro', () => {
    const session = { questions: [
      { status: QuizQuestionStatus.ANSWERED, attempt: { isCorrect: true } },
      { status: QuizQuestionStatus.ANSWERED, attempt: { isCorrect: false } },
      { status: QuizQuestionStatus.SKIPPED, attempt: null },
      { status: QuizQuestionStatus.PENDING, attempt: null }
    ] } as unknown as QuizSessionDetail;
    assert.deepEqual(calculateQuizSummary(session), { totalQuestions: 4, totalAnswered: 2, totalCorrect: 1, totalIncorrect: 1, totalSkipped: 1, percentageCorrect: 50 });
    assert.equal(calculateQuizSummary({ questions: [] } as unknown as QuizSessionDetail).percentageCorrect, 0);
  });
});
