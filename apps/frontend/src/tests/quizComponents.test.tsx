import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscursiveAssessment, QuestionType, QuizQuestionStatus, QuizSessionDetail } from '@bokken/shared';
import { AnsweredQuestionFeedback } from '../components/quiz/AnsweredQuestionFeedback.js';
import { QuizResultReview } from '../components/quiz/QuizResultReview.js';

describe('Componentes de feedback e revisão do quiz', () => {
  const correctOptionId = crypto.randomUUID(); const wrongOptionId = crypto.randomUUID(); const discursiveId = crypto.randomUUID(); const skippedId = crypto.randomUUID();
  const now = new Date().toISOString();
  const session: QuizSessionDetail = {
    id: crypto.randomUUID(), userId: crypto.randomUUID(), mode: 'FOCUS' as any,
    totalQuestions: 3, totalCorrect: 1, totalIncorrect: 1, durationSeconds: 35,
    startedAt: now, finishedAt: now, createdAt: now, updatedAt: now,
    questions: [
      { id: crypto.randomUUID(), sessionId: '', questionId: crypto.randomUUID(), position: 0, status: QuizQuestionStatus.ANSWERED, snapshotVersion: 1,
        snapshot: { type: QuestionType.MULTIPLE_CHOICE, statement: 'Capital question', explanation: 'Federal capital.', options: [
          { id: correctOptionId, text: 'Brasilia', isCorrect: true, orderIndex: 0 }, { id: wrongOptionId, text: 'Rio', isCorrect: false, orderIndex: 1 }
        ] }, attempt: { id: crypto.randomUUID(), questionId: '', isCorrect: true, selectedOptionId: correctOptionId, selectedOptionTextSnapshot: 'Brasilia', discursiveAssessment: null, timeSpentSeconds: 5, clientCreatedAt: now } },
      { id: crypto.randomUUID(), sessionId: '', questionId: discursiveId, position: 1, status: QuizQuestionStatus.ANSWERED, snapshotVersion: 1,
        snapshot: { type: QuestionType.DISCURSIVE, statement: 'Explain the rule.', expectedAnswer: 'Expected rule.', explanation: 'Rule detail.', options: [] },
        attempt: { id: crypto.randomUUID(), questionId: discursiveId, isCorrect: false, selectedOptionId: null, selectedOptionTextSnapshot: null, discursiveAssessment: DiscursiveAssessment.INCORRECT, timeSpentSeconds: 10, clientCreatedAt: now } },
      { id: crypto.randomUUID(), sessionId: '', questionId: skippedId, position: 2, status: QuizQuestionStatus.SKIPPED, snapshotVersion: 1,
        snapshot: { type: QuestionType.MULTIPLE_CHOICE, statement: 'Skipped question', options: [
          { id: crypto.randomUUID(), text: 'Skipped correct', isCorrect: true, orderIndex: 0 }, { id: crypto.randomUUID(), text: 'Other', isCorrect: false, orderIndex: 1 }
        ] }, attempt: null }
    ]
  };

  it('mantém o resultado da última resposta visível e oferece avanço explícito antes da conclusão', () => {
    const markup = renderToStaticMarkup(React.createElement(AnsweredQuestionFeedback, { question: session.questions[1], isLast: true, onAdvance: () => undefined }));
    assert.match(markup, /Você errou/);
    assert.match(markup, /Expected rule/);
    assert.match(markup, /Rule detail/);
    assert.match(markup, /Ver resultado/);
  });

  it('mostra revisão individual, alternativas selecionadas/corretas, autoavaliação e pergunta pulada', () => {
    const markup = renderToStaticMarkup(React.createElement(QuizResultReview, { session }));
    assert.match(markup, /2 respondidas/);
    assert.match(markup, /1 acertos/);
    assert.match(markup, /1 erros/);
    assert.match(markup, /1 puladas/);
    assert.match(markup, /50%/);
    assert.match(markup, /Brasilia — correta — selecionada/);
    assert.match(markup, /Autoavaliação:<\/strong> Errei/);
    assert.match(markup, /Skipped question/);
    assert.match(markup, /Pulada/);
  });
});
