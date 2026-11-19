import React from 'react';
import { DiscursiveAssessment, QuestionType, QuizSessionQuestion } from '@bokken/shared';

export const AnsweredQuestionFeedback: React.FC<{ question: QuizSessionQuestion; isLast: boolean; onAdvance: () => void; busy?: boolean }> = ({ question, isLast, onAdvance, busy = false }) => {
  const snapshot = question.snapshot;
  const attempt = question.attempt;
  return <section aria-label="Feedback da resposta" className="space-y-4">
    <h2 className="text-xl font-semibold whitespace-pre-wrap">{snapshot.statement}</h2>
    <p role="status" className={attempt?.isCorrect ? 'text-emerald-800 font-semibold' : 'text-red-700 font-semibold'}>{attempt?.isCorrect ? 'Você acertou.' : 'Você errou.'}</p>
    {snapshot.type === QuestionType.MULTIPLE_CHOICE ? <ul className="space-y-2">{snapshot.options.map(option => <li key={option.id} className={option.isCorrect ? 'text-emerald-800 font-semibold' : option.id === attempt?.selectedOptionId ? 'text-red-700' : 'text-slate-600'}>
      {option.text}{option.isCorrect ? ' — correta' : ''}{option.id === attempt?.selectedOptionId ? ' — selecionada' : ''}
    </li>)}</ul> : <><p><strong>Resposta esperada:</strong> {snapshot.expectedAnswer}</p><p><strong>Autoavaliação:</strong> {attempt?.discursiveAssessment === DiscursiveAssessment.CORRECT ? 'Acertei' : 'Errei'}</p></>}
    {snapshot.explanation && <p className="text-slate-600">{snapshot.explanation}</p>}
    <button type="button" disabled={busy} onClick={onAdvance} className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">{isLast ? 'Ver resultado' : 'Próxima pergunta'}</button>
  </section>;
};
