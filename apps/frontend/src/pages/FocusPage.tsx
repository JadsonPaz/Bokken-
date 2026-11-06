import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { FocusWithCount, SubjectWithCount } from '@bokken/shared';
import { getFocus, listSubjects, createSubject, updateSubject, deleteSubject, updateFocus, deleteFocus } from '../services/contentApi.js';
import { SubjectForm } from '../components/content/SubjectForm.js';
import { FocusForm } from '../components/content/FocusForm.js';
import { Modal } from '../components/ui/Modal.js';
import {
  BookOpen, ArrowLeft, Plus, Pencil, Trash2,
  Layers, HelpCircle, ChevronRight, Loader2
} from 'lucide-react';

export const FocusPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [focus, setFocus] = useState<FocusWithCount | null>(null);
  const [subjects, setSubjects] = useState<SubjectWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [editSubject, setEditSubject] = useState<SubjectWithCount | null>(null);
  const [confirmDeleteSubjectId, setConfirmDeleteSubjectId] = useState<string | null>(null);
  const [deletingSubjectId, setDeletingSubjectId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [showEditFocus, setShowEditFocus] = useState(false);
  const [confirmDeleteFocus, setConfirmDeleteFocus] = useState(false);
  const [deletingFocus, setDeletingFocus] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    Promise.all([getFocus(id, token), listSubjects(id, token)])
      .then(([f, s]) => {
        setFocus(f as FocusWithCount);
        setSubjects(s);
      })
      .catch(err => setError(err.message || 'Erro ao carregar foco.'))
      .finally(() => setLoading(false));
  }, [token, id]);

  const handleCreateSubject = async (data: { name: string; description?: string; focusId: string }) => {
    if (!token) return;
    setFormLoading(true);
    try {
      const created = await createSubject(data, token);
      setSubjects(prev => [...prev, created]);
      setShowCreateSubject(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateSubject = async (data: { name: string; description?: string }) => {
    if (!token || !editSubject) return;
    setFormLoading(true);
    try {
      const updated = await updateSubject(editSubject.id, data, token);
      setSubjects(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditSubject(null);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    if (!token) return;
    setDeletingSubjectId(subjectId);
    try {
      await deleteSubject(subjectId, token);
      setSubjects(prev => prev.filter(s => s.id !== subjectId));
      setConfirmDeleteSubjectId(null);
    } finally {
      setDeletingSubjectId(null);
    }
  };

  const handleUpdateFocus = async (data: { name: string; description?: string; color: string }) => {
    if (!token || !id) return;
    setFormLoading(true);
    try {
      const updated = await updateFocus(id, data, token);
      setFocus(updated as FocusWithCount);
      setShowEditFocus(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteFocus = async () => {
    if (!token || !id) return;
    setDeletingFocus(true);
    try {
      await deleteFocus(id, token);
      navigate('/');
    } finally {
      setDeletingFocus(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bokken-surface-soft flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !focus) {
    return (
      <div className="min-h-screen bg-bokken-surface-soft flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600 text-sm">{error || 'Foco não encontrado.'}</p>
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
            to="/"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title="Voltar ao painel"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: focus.color ?? '#1e3a8a' }}
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base text-slate-900 truncate">{focus.name}</h1>
            <span className="text-xs text-slate-500">Foco de Estudo</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowEditFocus(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-bokken-navy hover:bg-blue-50 transition"
              title="Editar foco"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConfirmDeleteFocus(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-50 transition"
              title="Excluir foco"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Descrição e Stats */}
        {focus.description && (
          <p className="text-sm text-slate-600">{focus.description}</p>
        )}
        <div className="flex gap-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            {subjects.length} matéria{subjects.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" />
            {subjects.reduce((acc, s) => acc + (s.questionsCount ?? 0), 0)} perguntas
          </span>
        </div>

        {/* Matérias */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-bokken-navy" />
              Matérias
            </h2>
            <button
              onClick={() => setShowCreateSubject(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nova Matéria
            </button>
          </div>

          {subjects.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-14 text-center">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Nenhuma matéria criada ainda.</p>
              <button
                onClick={() => setShowCreateSubject(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition"
              >
                <Plus className="w-4 h-4" /> Criar Primeira Matéria
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map(subject => (
                <div
                  key={subject.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition flex items-center gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm">{subject.name}</h3>
                    {subject.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{subject.description}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        {subject.questionsCount ?? 0} pergunta{subject.questionsCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => setEditSubject(subject)}
                      className="p-1.5 text-slate-400 hover:text-bokken-navy hover:bg-blue-50 rounded-lg transition"
                      title="Editar matéria"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteSubjectId(subject.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Excluir matéria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Link
                    to={`/subjects/${subject.id}`}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold text-bokken-navy hover:text-bokken-navy-accent"
                  >
                    Ver perguntas <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modals: Matéria */}
      {showCreateSubject && (
        <Modal title="Nova Matéria" onClose={() => setShowCreateSubject(false)}>
          <SubjectForm
            focusId={id!}
            onSubmit={handleCreateSubject}
            onCancel={() => setShowCreateSubject(false)}
            loading={formLoading}
          />
        </Modal>
      )}
      {editSubject && (
        <Modal title="Editar Matéria" onClose={() => setEditSubject(null)}>
          <SubjectForm
            focusId={id!}
            initial={editSubject}
            onSubmit={handleUpdateSubject}
            onCancel={() => setEditSubject(null)}
            loading={formLoading}
          />
        </Modal>
      )}
      {confirmDeleteSubjectId && (
        <Modal title="Excluir Matéria" onClose={() => setConfirmDeleteSubjectId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Esta ação excluirá a matéria e todas as perguntas associadas a ela. Deseja continuar?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteSubjectId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteSubject(confirmDeleteSubjectId)}
                disabled={deletingSubjectId === confirmDeleteSubjectId}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deletingSubjectId === confirmDeleteSubjectId ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modals: Foco */}
      {showEditFocus && (
        <Modal title="Editar Foco" onClose={() => setShowEditFocus(false)}>
          <FocusForm
            initial={focus}
            onSubmit={handleUpdateFocus}
            onCancel={() => setShowEditFocus(false)}
            loading={formLoading}
          />
        </Modal>
      )}
      {confirmDeleteFocus && (
        <Modal title="Excluir Foco" onClose={() => setConfirmDeleteFocus(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Esta ação excluirá permanentemente <strong>{focus.name}</strong>, todas as suas matérias e perguntas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteFocus(false)} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Cancelar</button>
              <button
                onClick={handleDeleteFocus}
                disabled={deletingFocus}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deletingFocus ? 'Excluindo...' : 'Excluir Foco'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
