import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { Question, QuestionType, SubjectWithCount } from '@bokken/shared';
import {
  getSubject, listQuestions, createQuestion, updateQuestion, deleteQuestion,
  updateSubject, deleteSubject
} from '../services/contentApi.js';
import { QuestionForm, QuestionFormData } from '../components/content/QuestionForm.js';
import { SubjectForm } from '../components/content/SubjectForm.js';
import { Modal } from '../components/ui/Modal.js';
import {
  ArrowLeft, Plus, Pencil, Trash2,
  HelpCircle, Search, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, AlignLeft
} from 'lucide-react';

export const SubjectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [subject, setSubject] = useState<SubjectWithCount | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState('');
  const LIMIT = 10;

  const [showCreate, setShowCreate] = useState(false);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);
  const [deletingQId, setDeletingQId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [showEditSubject, setShowEditSubject] = useState(false);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Carrega dados da matéria
  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    getSubject(id, token)
      .then(setSubject)
      .catch(err => setError(err.message || 'Erro ao carregar matéria.'))
      .finally(() => setLoading(false));
  }, [token, id]);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Carrega perguntas
  const fetchQuestions = useCallback(async () => {
    if (!token || !id) return;
    setQuestionsLoading(true);
    try {
      const result = await listQuestions(id, { search: debouncedSearch || undefined, page, limit: LIMIT }, token);
      setQuestions(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar perguntas.');
    } finally {
      setQuestionsLoading(false);
    }
  }, [token, id, debouncedSearch, page]);

  useEffect(() => {
    if (!loading) fetchQuestions();
  }, [fetchQuestions, loading]);

  const handleCreate = async (data: QuestionFormData) => {
    if (!token) return;
    setFormLoading(true);
    try {
      await createQuestion(data, token);
      setShowCreate(false);
      setPage(1);
      await fetchQuestions();
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (data: QuestionFormData) => {
    if (!token || !editQuestion) return;
    setFormLoading(true);
    try {
      await updateQuestion(editQuestion.id, data, token);
      setEditQuestion(null);
      await fetchQuestions();
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteQ = async (qId: string) => {
    if (!token) return;
    setDeletingQId(qId);
    try {
      await deleteQuestion(qId, token);
      setConfirmDeleteQId(null);
      await fetchQuestions();
    } finally {
      setDeletingQId(null);
    }
  };

  const handleUpdateSubject = async (data: { name: string; description?: string; focusId: string }) => {
    if (!token || !id) return;
    setFormLoading(true);
    try {
      const updated = await updateSubject(id, { name: data.name, description: data.description }, token);
      setSubject(updated);
      setShowEditSubject(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!token || !id || !subject) return;
    setDeletingSubject(true);
    try {
      await deleteSubject(id, token);
      navigate(`/foci/${subject.focusId}`);
    } finally {
      setDeletingSubject(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bokken-surface-soft flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="min-h-screen bg-bokken-surface-soft flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600 text-sm">{error || 'Matéria não encontrada.'}</p>
        <Link to="/" className="text-bokken-navy text-sm font-medium hover:underline">← Voltar ao painel</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bokken-surface-soft flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link
            to={`/foci/${subject.focusId}`}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title="Voltar ao foco"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base text-slate-900 truncate">{subject.name}</h1>
            <span className="text-xs text-slate-500">Matéria · {total} pergunta{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowEditSubject(true)} className="p-2 rounded-xl text-slate-500 hover:text-bokken-navy hover:bg-blue-50 transition" title="Editar matéria">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setConfirmDeleteSubject(true)} className="p-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-50 transition" title="Excluir matéria">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {subject.description && (
          <p className="text-sm text-slate-600">{subject.description}</p>
        )}

        {/* Barra de ações */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar perguntas..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent bg-white"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" /> Nova Pergunta
          </button>
        </div>

        {/* Lista de perguntas */}
        {questionsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-14 text-center">
            <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">
              {debouncedSearch ? 'Nenhuma pergunta encontrada.' : 'Nenhuma pergunta criada ainda.'}
            </p>
            {!debouncedSearch && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition"
              >
                <Plus className="w-4 h-4" /> Criar Primeira Pergunta
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map(q => (
              <div
                key={q.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition group"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 shrink-0 p-1 rounded-lg ${
                    q.type === QuestionType.MULTIPLE_CHOICE
                      ? 'bg-blue-50 text-bokken-navy'
                      : 'bg-emerald-50 text-bokken-pine'
                  }`}>
                    {q.type === QuestionType.MULTIPLE_CHOICE
                      ? <CheckCircle className="w-3.5 h-3.5" />
                      : <AlignLeft className="w-3.5 h-3.5" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 font-medium leading-snug">{q.statement}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                      <span>{q.type === QuestionType.MULTIPLE_CHOICE ? 'Múltipla Escolha' : 'Discursiva'}</span>
                      {q.type === QuestionType.MULTIPLE_CHOICE && (
                        <span>{q.options?.length ?? 0} alternativa{q.options?.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {q.type === QuestionType.MULTIPLE_CHOICE && q.options && q.options.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map(o => (
                          <li key={o.id} className={`text-xs flex items-center gap-1.5 ${o.isCorrect ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${o.isCorrect ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button
                      onClick={() => setEditQuestion(q)}
                      className="p-1.5 text-slate-400 hover:text-bokken-navy hover:bg-blue-50 rounded-lg transition"
                      title="Editar pergunta"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteQId(q.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Excluir pergunta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500">
                  Página {page} de {totalPages} · {total} pergunta{total !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals: Perguntas */}
      {showCreate && (
        <Modal title="Nova Pergunta" onClose={() => setShowCreate(false)}>
          <QuestionForm
            subjectId={id!}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            loading={formLoading}
          />
        </Modal>
      )}
      {editQuestion && (
        <Modal title="Editar Pergunta" onClose={() => setEditQuestion(null)}>
          <QuestionForm
            subjectId={id!}
            initial={editQuestion}
            onSubmit={handleUpdate}
            onCancel={() => setEditQuestion(null)}
            loading={formLoading}
          />
        </Modal>
      )}
      {confirmDeleteQId && (
        <Modal title="Excluir Pergunta" onClose={() => setConfirmDeleteQId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">Tem certeza que deseja excluir esta pergunta?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteQId(null)} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Cancelar</button>
              <button
                onClick={() => handleDeleteQ(confirmDeleteQId)}
                disabled={deletingQId === confirmDeleteQId}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deletingQId === confirmDeleteQId ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modals: Matéria */}
      {showEditSubject && (
        <Modal title="Editar Matéria" onClose={() => setShowEditSubject(false)}>
          <SubjectForm
            focusId={subject.focusId}
            initial={subject}
            onSubmit={handleUpdateSubject}
            onCancel={() => setShowEditSubject(false)}
            loading={formLoading}
          />
        </Modal>
      )}
      {confirmDeleteSubject && (
        <Modal title="Excluir Matéria" onClose={() => setConfirmDeleteSubject(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Esta ação excluirá <strong>{subject.name}</strong> e todas as suas perguntas. Deseja continuar?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteSubject(false)} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Cancelar</button>
              <button
                onClick={handleDeleteSubject}
                disabled={deletingSubject}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deletingSubject ? 'Excluindo...' : 'Excluir Matéria'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
