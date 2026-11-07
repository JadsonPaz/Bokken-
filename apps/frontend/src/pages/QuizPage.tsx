import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DiscursiveAssessment, QuestionType, QuizMode, QuizQuestionStatus, QuizSessionDetail, FocusWithCount, SubjectWithCount } from '@bokken/shared';
import { useAuth } from '../context/AuthContext.js';
import { listFoci, listSubjects } from '../services/contentApi.js';
import { answerQuiz, completeQuiz, createQuiz, getQuiz, revealQuizAnswer, skipQuiz } from '../services/quizApi.js';

export const QuizPage: React.FC = () => {
  const { id } = useParams(); const {token} = useAuth(); const navigate = useNavigate();
  const [foci,setFoci]=useState<FocusWithCount[]>([]); const [subjects,setSubjects]=useState<SubjectWithCount[]>([]);
  const [mode,setMode]=useState<QuizMode>(QuizMode.GENERAL_ALL); const [focusId,setFocusId]=useState(''); const [subjectId,setSubjectId]=useState('');
  const [focusIds,setFocusIds]=useState<string[]>([]); const [types,setTypes]=useState<QuestionType[]>([QuestionType.MULTIPLE_CHOICE,QuestionType.DISCURSIVE]);
  const [limit,setLimit]=useState('20'); const [session,setSession]=useState<QuizSessionDetail|null>(null); const [selected,setSelected]=useState('');
  const [showExpected,setShowExpected]=useState(false);
  const [revealedAnswer,setRevealedAnswer]=useState<{expectedAnswer:string;explanation:string|null}|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [feedback,setFeedback]=useState('');
  const answerKeys=useRef<Record<string,string>>({});
  const answerKeyFor=(questionId:string)=>answerKeys.current[questionId]??(answerKeys.current[questionId]=crypto.randomUUID());
  useEffect(()=>{ if(!token)return; listFoci(token).then(async fs=>{setFoci(fs);const all=await Promise.all(fs.map(f=>listSubjects(f.id,token)));setSubjects(all.flat());}).catch(e=>setError(e.message)); },[token]);
  useEffect(()=>{ if(!token||!id)return; getQuiz(id,token).then(setSession).catch(e=>setError(e.message)); },[token,id]);
  const current=useMemo(()=>session?.questions.find(q=>q.status===QuizQuestionStatus.PENDING),[session]);
  useEffect(()=>{setShowExpected(false);setRevealedAnswer(null);},[current?.id]);
  const create=async()=>{ if(!token)return;setBusy(true);setError('');try{const created=await createQuiz({mode,...(mode===QuizMode.FOCUS?{focusId}:{}),...(mode===QuizMode.SUBJECT?{subjectId}:{}),...(mode===QuizMode.GENERAL_CUSTOM?{focusIds}:{}),types,limit:limit===''?null:Number(limit)},token);navigate(`/quiz/sessions/${created.id}`);}catch(e:any){setError(e.message);}finally{setBusy(false);} };
  const refresh=async()=>{if(token&&id)setSession(await getQuiz(id,token));};
  const sendAnswer=async(payload:unknown)=>{if(!token||!id||!current)return;setBusy(true);setError('');try{const result=await answerQuiz(id,current.id,payload,token);const attempt=result.attempt;const correct=attempt.questionSnapshot?.options?.find((o:any)=>o.isCorrect)?.text;setFeedback(`${attempt.isCorrect?'Você acertou.':'Você errou.'}${correct?` Resposta correta: ${correct}`:''}${attempt.questionSnapshot?.explanation?` ${attempt.questionSnapshot.explanation}`:''}`);setSelected('');await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);} };
  const skip=async()=>{if(!token||!id||!current)return;setBusy(true);try{await skipQuiz(id,current.id,token);await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);} };
  const reveal=async()=>{if(!token||!id||!current)return;setBusy(true);setError('');try{setRevealedAnswer(await revealQuizAnswer(id,current.id,token));setShowExpected(true);}catch(e:any){setError(e.message);}finally{setBusy(false);} };
  const finish=async()=>{if(!token||!id)return;setBusy(true);try{setSession(await completeQuiz(id,token));}catch(e:any){setError(e.message);}finally{setBusy(false);} };
  if(!id) return <main className="max-w-3xl mx-auto p-6 space-y-5"><Link to="/" className="text-sm text-blue-800">← Painel</Link><h1 className="text-2xl font-bold">Configurar quiz</h1>{error&&<p role="alert" className="text-red-700">{error}</p>}
    <label className="block">Modo<select className="block w-full border rounded p-2" value={mode} onChange={e=>setMode(e.target.value as QuizMode)}>{Object.values(QuizMode).map(m=><option key={m} value={m}>{({SUBJECT:'Por matéria',FOCUS:'Por foco',GENERAL_ALL:'Geral — todos os focos',GENERAL_CUSTOM:'Geral — focos selecionados'} as Record<string,string>)[m]}</option>)}</select></label>
    {mode===QuizMode.FOCUS&&<label className="block">Foco<select className="block w-full border rounded p-2" value={focusId} onChange={e=>setFocusId(e.target.value)}><option value="">Selecione</option>{foci.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
    {mode===QuizMode.SUBJECT&&<label className="block">Matéria<select className="block w-full border rounded p-2" value={subjectId} onChange={e=>setSubjectId(e.target.value)}><option value="">Selecione</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {mode===QuizMode.GENERAL_CUSTOM&&<fieldset><legend>Focos (selecione ao menos dois)</legend>{foci.map(f=><label key={f.id} className="block"><input type="checkbox" checked={focusIds.includes(f.id)} onChange={e=>setFocusIds(old=>e.target.checked?[...old,f.id]:old.filter(x=>x!==f.id))}/> {f.name}</label>)}</fieldset>}
    <fieldset><legend>Tipos de pergunta</legend>{[[QuestionType.MULTIPLE_CHOICE,'Múltipla escolha'],[QuestionType.DISCURSIVE,'Discursiva']].map(([type,label])=><label key={type} className="mr-4"><input type="checkbox" checked={types.includes(type as QuestionType)} onChange={e=>setTypes(old=>e.target.checked?[...old,type as QuestionType]:old.filter(t=>t!==type))}/> {label}</label>)}</fieldset>
    <label className="block">Quantidade (vazio = todas disponíveis)<input className="block border rounded p-2" type="number" min="1" max="200" value={limit} onChange={e=>setLimit(e.target.value)}/></label><button disabled={busy} onClick={create} className="px-4 py-2 rounded bg-slate-900 text-white">{busy?'Criando…':'Iniciar quiz'}</button>
  </main>;
  if(!session)return <main className="p-8">{error||'Carregando sessão…'}</main>;
  const answered=session.questions.filter(q=>q.status===QuizQuestionStatus.ANSWERED).length;const skipped=session.questions.filter(q=>q.status===QuizQuestionStatus.SKIPPED).length;
  if(session.finishedAt)return <main className="max-w-2xl mx-auto p-6 space-y-4"><h1 className="text-2xl font-bold">Resultado do quiz</h1><p>{session.totalQuestions} perguntas · {session.totalCorrect} acertos · {session.totalIncorrect} erros · {skipped} puladas</p><p>{session.totalCorrect+session.totalIncorrect?Math.round(session.totalCorrect/(session.totalCorrect+session.totalIncorrect)*100):0}% de acerto entre as respondidas</p><Link className="text-blue-800" to="/quiz">Novo quiz</Link> · <Link className="text-blue-800" to="/">Painel</Link></main>;
  if(!current)return <main className="p-6"><p>Sessão completa.</p><button onClick={finish}>Ver resultado</button></main>;
  const q=current.snapshot;
  return <main className="max-w-3xl mx-auto p-6 space-y-5"><Link to="/">← Painel</Link><p>Pergunta {current.position+1} de {session.totalQuestions} · Respondidas {answered} · Puladas {skipped}</p><article className="bg-white p-6 rounded-xl border space-y-4"><h1 className="text-xl font-semibold whitespace-pre-wrap">{q.statement}</h1>
    {q.type===QuestionType.MULTIPLE_CHOICE?<div className="space-y-2">{q.options.map(o=><label key={o.id} className="block border rounded-lg p-3"><input type="radio" name="answer" value={o.id} checked={selected===o.id} onChange={()=>setSelected(o.id)}/> {o.text}</label>)}<button disabled={!selected||busy} className="px-4 py-2 bg-slate-900 text-white rounded" onClick={()=>sendAnswer({type:q.type,selectedOptionId:selected,idempotencyKey:answerKeyFor(current.id),timeSpentSeconds:0})}>Responder</button></div>
    :<div className="space-y-3">{!showExpected?<button disabled={busy} onClick={reveal} className="px-4 py-2 border rounded">Mostrar resposta esperada</button>:<><p className="text-slate-600">Resposta esperada: {revealedAnswer?.expectedAnswer}</p><button disabled={busy} onClick={()=>sendAnswer({type:q.type,assessment:DiscursiveAssessment.CORRECT,idempotencyKey:answerKeyFor(current.id),timeSpentSeconds:0})} className="mr-2 px-4 py-2 bg-emerald-700 text-white rounded">Acertei</button><button disabled={busy} onClick={()=>sendAnswer({type:q.type,assessment:DiscursiveAssessment.INCORRECT,idempotencyKey:answerKeyFor(current.id),timeSpentSeconds:0})} className="px-4 py-2 bg-red-700 text-white rounded">Errei</button></>}</div>}
    {feedback&&<p role="status">Resultado anterior: {feedback}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}{revealedAnswer?.explanation&&<p>{revealedAnswer.explanation}</p>}</article><div className="flex gap-3"><button disabled={busy} onClick={skip} className="border rounded px-4 py-2">Pular</button><button disabled={busy} onClick={finish} className="border rounded px-4 py-2">Encerrar quiz</button></div></main>;
};
