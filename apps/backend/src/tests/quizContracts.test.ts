import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createQuizSessionSchema, DiscursiveAssessment, QuestionSnapshot, QuestionType, QuizMode, submitQuizAnswerSchema } from '@bokken/shared';
import { evaluateAnswer, projectSnapshot } from '../services/quizService.js';

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
});
