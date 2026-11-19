import { QuizQuestionStatus, QuizSessionDetail, QuizSessionSummary } from './types/index.js';

export function calculateQuizSummary(session: Pick<QuizSessionDetail, 'questions'>): QuizSessionSummary {
  const totalAnswered = session.questions.filter(q => q.status === QuizQuestionStatus.ANSWERED).length;
  const totalCorrect = session.questions.filter(q => q.status === QuizQuestionStatus.ANSWERED && q.attempt?.isCorrect === true).length;
  const totalIncorrect = totalAnswered - totalCorrect;
  const totalSkipped = session.questions.filter(q => q.status === QuizQuestionStatus.SKIPPED).length;
  return {
    totalQuestions: session.questions.length, totalAnswered, totalCorrect, totalIncorrect, totalSkipped,
    percentageCorrect: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0
  };
}
