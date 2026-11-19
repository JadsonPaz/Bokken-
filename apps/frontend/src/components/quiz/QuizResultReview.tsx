import React from 'react';
import { calculateQuizSummary, DiscursiveAssessment, QuestionType, QuizQuestionStatus, QuizSessionDetail } from '@bokken/shared';

export const QuizResultReview: React.FC<{ session: QuizSessionDetail }> = ({ session }) => {
  const summary = calculateQuizSummary(session);
  return <>
    <p>{summary.totalQuestions} perguntas · {summary.totalAnswered} respondidas · {summary.totalCorrect} acertos · {summary.totalIncorrect} erros · {summary.totalSkipped} puladas</p>
    <p>{summary.percentageCorrect}% de acerto entre as respondidas</p>
    <section aria-label="Revisão das perguntas" className="space-y-3">
      {session.questions.map(question => <article key={question.id} className="bg-white border rounded-xl p-4 space-y-2">
        <p className="text-xs font-medium text-slate-500">{question.position + 1}. {question.snapshot.type === QuestionType.MULTIPLE_CHOICE ? 'Múltipla escolha' : 'Discursiva'} · {question.status === QuizQuestionStatus.SKIPPED ? 'Pulada' : question.attempt?.isCorrect ? 'Acertou' : 'Errou'}</p>
        <h2 className="font-semibold whitespace-pre-wrap">{question.snapshot.statement}</h2>
        {question.snapshot.type === QuestionType.MULTIPLE_CHOICE ? <ul className="space-y-1">{question.snapshot.options.map(option => <li key={option.id} className={option.isCorrect ? 'text-emerald-800 font-semibold' : option.id === question.attempt?.selectedOptionId ? 'text-red-700' : 'text-slate-600'}>
          {option.text}{option.isCorrect ? ' — correta' : ''}{option.id === question.attempt?.selectedOptionId ? ' — selecionada' : ''}
        </li>)}</ul> : <><p><strong>Resposta esperada:</strong> {question.snapshot.expectedAnswer}</p><p><strong>Autoavaliação:</strong> {question.attempt?.discursiveAssessment === DiscursiveAssessment.CORRECT ? 'Acertei' : question.attempt?.discursiveAssessment === DiscursiveAssessment.INCORRECT ? 'Errei' : 'Não respondida'}</p></>}
        {question.snapshot.explanation && <p className="text-slate-600"><strong>Explicação:</strong> {question.snapshot.explanation}</p>}
      </article>)}
    </section>
  </>;
};
