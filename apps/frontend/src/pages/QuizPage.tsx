import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { calculateQuizSummary, DiscursiveAssessment, FocusWithCount, QuestionType, QuizMode, QuizQuestionStatus, QuizSessionDetail, SubjectWithCount } from '@bokken/shared';
import { useAuth } from '../context/AuthContext.js';
import { AnsweredQuestionFeedback } from '../components/quiz/AnsweredQuestionFeedback.js';
import { QuizResultReview } from '../components/quiz/QuizResultReview.js';
import { listFoci, listSubjects } from '../services/contentApi.js';
import { answerQuiz, completeQuiz, createQuiz, getQuiz, revealQuizAnswer, skipQuiz } from '../services/quizApi.js';

export const QuizPage: React.FC = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [foci, setFoci] = useState<FocusWithCount[]>([]);
  const [subjects, setSubjects] = useState<SubjectWithCount[]>([]);
  const [mode, setMode] = useState<QuizMode>(QuizMode.GENERAL_ALL);
  const [focusId, setFocusId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [types, setTypes] = useState<QuestionType[]>([QuestionType.MULTIPLE_CHOICE, QuestionType.DISCURSIVE]);
  const [limit, setLimit] = useState('20');
  const [session, setSession] = useState<QuizSessionDetail | null>(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ expectedAnswer: string; explanation: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answerKeys = useRef<Record<string, string>>({});
  const answerKeyFor = (questionId: string) => answerKeys.current[questionId] ?? (answerKeys.current[questionId] = crypto.randomUUID());

  useEffect(() => {
    if (!token || id) return;
    listFoci(token).then(async fociResult => {
      setFoci(fociResult);
      const subjectsByFocus = await Promise.all(fociResult.map(focus => listSubjects(focus.id, token)));
      setSubjects(subjectsByFocus.flat());
    }).catch(err => setError(err.message || 'Não foi possível carregar os conteúdos.'));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    getQuiz(id, token).then(setSession).catch(err => setError(err.message || 'Não foi possível carregar o quiz.'));
  }, [token, id]);

  const current = useMemo(() => {
    if (!session) return undefined;
    return (reviewingId ? session.questions.find(question => question.id === reviewingId) : undefined)
      ?? session.questions.find(question => question.status === QuizQuestionStatus.PENDING);
  }, [session, reviewingId]);

  useEffect(() => {
    setSelectedOption('');
    setRevealed(null);
  }, [current?.id]);

  const createSession = async () => {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const created = await createQuiz({
        mode,
        ...(mode === QuizMode.FOCUS ? { focusId } : {}),
        ...(mode === QuizMode.SUBJECT ? { subjectId } : {}),
        ...(mode === QuizMode.GENERAL_CUSTOM ? { focusIds } : {}),
        types, limit: limit === '' ? null : Number(limit)
      }, token);
      navigate(`/quiz/sessions/${created.id}`);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const refreshSession = async () => {
    if (!token || !id) return null;
    const updated = await getQuiz(id, token);
    setSession(updated);
    return updated;
  };

  const submitAnswer = async (payload: unknown) => {
    if (!token || !id || !current) return;
    setBusy(true); setError('');
    try {
      await answerQuiz(id, current.id, payload, token);
      const updated = await refreshSession();
      if (updated) setReviewingId(current.id);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const skipQuestion = async () => {
    if (!token || !id || !current) return;
    setBusy(true); setError('');
    try {
      await skipQuiz(id, current.id, token);
      setReviewingId(null);
      await refreshSession();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const revealExpectedAnswer = async () => {
    if (!token || !id || !current) return;
    setBusy(true); setError('');
    try { setRevealed(await revealQuizAnswer(id, current.id, token)); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const advanceOrComplete = async () => {
    if (!token || !id || !session) return;
    const hasPending = session.questions.some(question => question.status === QuizQuestionStatus.PENDING);
    if (hasPending) { setReviewingId(null); return; }
    setBusy(true); setError('');
    try { setSession(await completeQuiz(id, token)); setReviewingId(null); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (!id) return (
    <main className="max-w-3xl mx-auto p-6 space-y-5">
      <Link to="/" className="text-sm text-blue-800">← Painel</Link>
      <h1 className="text-2xl font-bold">Configurar quiz</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <label className="block">Modo<select className="block w-full border rounded p-2" value={mode} onChange={event => setMode(event.target.value as QuizMode)}>
        <option value={QuizMode.SUBJECT}>Por matéria</option><option value={QuizMode.FOCUS}>Por foco</option>
        <option value={QuizMode.GENERAL_ALL}>Geral — todos os focos</option><option value={QuizMode.GENERAL_CUSTOM}>Geral — focos selecionados</option>
      </select></label>
      {mode === QuizMode.FOCUS && <label className="block">Foco<select className="block w-full border rounded p-2" value={focusId} onChange={event => setFocusId(event.target.value)}><option value="">Selecione</option>{foci.map(focus => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select></label>}
      {mode === QuizMode.SUBJECT && <label className="block">Matéria<select className="block w-full border rounded p-2" value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Selecione</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>}
      {mode === QuizMode.GENERAL_CUSTOM && <fieldset><legend>Focos (selecione ao menos dois)</legend>{foci.map(focus => <label key={focus.id} className="block"><input type="checkbox" checked={focusIds.includes(focus.id)} onChange={event => setFocusIds(old => event.target.checked ? [...old, focus.id] : old.filter(value => value !== focus.id))} /> {focus.name}</label>)}</fieldset>}
      <fieldset><legend>Tipos de pergunta</legend>{[[QuestionType.MULTIPLE_CHOICE, 'Múltipla escolha'], [QuestionType.DISCURSIVE, 'Discursiva']].map(([type, label]) => <label key={type} className="mr-4"><input type="checkbox" checked={types.includes(type as QuestionType)} onChange={event => setTypes(old => event.target.checked ? [...old, type as QuestionType] : old.filter(value => value !== type))} /> {label}</label>)}</fieldset>
      <label className="block">Quantidade (vazio = todas disponíveis)<input className="block border rounded p-2" type="number" min="1" max="200" value={limit} onChange={event => setLimit(event.target.value)} /></label>
      <button disabled={busy || types.length === 0} onClick={createSession} className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">{busy ? 'Criando…' : 'Iniciar quiz'}</button>
    </main>
  );

  if (!session) return <main className="p-8">{error || 'Carregando sessão…'}</main>;
  const summary = calculateQuizSummary(session);
  if (session.finishedAt) return (
    <main className="max-w-3xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold">Resultado do quiz</h1>
      <QuizResultReview session={session} />
      <Link className="text-blue-800" to="/quiz">Novo quiz</Link> · <Link className="text-blue-800" to="/">Painel</Link>
    </main>
  );

  if (!current) return <main className="max-w-2xl mx-auto p-6 space-y-4"><p>Todas as perguntas foram respondidas ou puladas.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} onClick={advanceOrComplete} className="px-4 py-2 rounded bg-slate-900 text-white">Concluir quiz</button></main>;
  const question = current.snapshot;
  const reviewing = current.status === QuizQuestionStatus.ANSWERED;
  return <main className="max-w-3xl mx-auto p-6 space-y-5">
    <Link to="/">← Painel</Link>
    <p>Pergunta {current.position + 1} de {session.totalQuestions} · Respondidas {summary.totalAnswered} · Puladas {summary.totalSkipped}</p>
    <article className="bg-white p-6 rounded-xl border space-y-4">
      <h1 className="text-xl font-semibold whitespace-pre-wrap">{question.statement}</h1>
      {reviewing ? <AnsweredQuestionFeedback question={current} isLast={!session.questions.some(item => item.status === QuizQuestionStatus.PENDING)} onAdvance={advanceOrComplete} busy={busy} /> : <>
        {question.type === QuestionType.MULTIPLE_CHOICE ? <div className="space-y-2">{question.options.map(option => <label key={option.id} className="block border rounded-lg p-3"><input type="radio" name="answer" value={option.id} checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} /> {option.text}</label>)}<button disabled={!selectedOption || busy} className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50" onClick={() => submitAnswer({ type: question.type, selectedOptionId: selectedOption, idempotencyKey: answerKeyFor(current.id), timeSpentSeconds: 0 })}>Responder</button></div>
          : <div className="space-y-3">{!revealed ? <button disabled={busy} onClick={revealExpectedAnswer} className="px-4 py-2 border rounded disabled:opacity-50">Mostrar resposta esperada</button> : <><p className="text-slate-600">Resposta esperada: {revealed.expectedAnswer}</p>{revealed.explanation && <p className="text-slate-600">{revealed.explanation}</p>}<button disabled={busy} onClick={() => submitAnswer({ type: question.type, assessment: DiscursiveAssessment.CORRECT, idempotencyKey: answerKeyFor(current.id), timeSpentSeconds: 0 })} className="mr-2 px-4 py-2 bg-emerald-700 text-white rounded">Acertei</button><button disabled={busy} onClick={() => submitAnswer({ type: question.type, assessment: DiscursiveAssessment.INCORRECT, idempotencyKey: answerKeyFor(current.id), timeSpentSeconds: 0 })} className="px-4 py-2 bg-red-700 text-white rounded">Errei</button></>}</div>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button disabled={busy} onClick={skipQuestion} className="border rounded px-4 py-2 disabled:opacity-50">Pular</button>
      </>}
    </article>
  </main>;
};
