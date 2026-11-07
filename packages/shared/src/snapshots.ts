import { Question, QuestionSnapshot } from './types/index.js';
import { questionSnapshotSchema } from './schemas/index.js';

/** Creates a detached, validated, transport-safe copy of the question as presented. */
export function createQuestionSnapshot(question: Question): QuestionSnapshot {
  const snapshot = {
    type: question.type,
    statement: question.statement,
    explanation: question.explanation ?? null,
    expectedAnswer: question.expectedAnswer ?? null,
    options: (question.options ?? []).map(({ id, text, isCorrect, orderIndex }) => ({
      id,
      text,
      isCorrect,
      orderIndex
    }))
  };

  return questionSnapshotSchema.parse(snapshot);
}
