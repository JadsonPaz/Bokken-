import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { FocusWithCount } from '@bokken/shared';
import { listFoci, createFocus, updateFocus, deleteFocus } from '../services/contentApi.js';
import { FocusForm } from '../components/content/FocusForm.js';
import { Modal } from '../components/ui/Modal.js';
import {
  BookOpen, LogOut, Wifi, WifiOff, Plus, Pencil, Trash2,
  FolderKanban, ChevronRight, Layers, HelpCircle, Loader2
} from 'lucide-react';
import { APP_NAME } from '@bokken/shared';

export const DashboardPage: React.FC = () => {
  const { user, logout, isOnline, token } = useAuth();

  const [foci, setFoci] = useState<FocusWithCount[]>([]);
  const [loadingFoci, setLoadingFoci] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editFocus, setEditFocus] = useState<FocusWithCount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoadingFoci(true);
    setFetchError('');
    listFoci(token)
      .then(setFoci)
      .catch(err => setFetchError(err.message || 'Erro ao carregar focos.'))
      .finally(() => setLoadingFoci(false));
  }, [token]);

  const handleCreate = async (data: { name: string; description?: string; color: string }) => {
    if (!token) return;
    setFormLoading(true);
    try {
      const created = await createFocus(data, token);
      setFoci(prev => [created, ...prev]);
      setShowCreate(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (data: { name: string; description?: string; color: string }) => {
    if (!token || !editFocus) return;
    setFormLoading(true);
    try {
      const updated = await updateFocus(editFocus.id, data, token);
      setFoci(prev => prev.map(f => f.id === updated.id ? updated : f));
      setEditFocus(null);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setDeletingId(id);
    try {
      await deleteFocus(id, token);
      setFoci(prev => prev.filter(f => f.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bokken-surface-soft flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bokken-navy flex items-center justify-center text-white shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-bokken-navy tracking-tight">{APP_NAME}</h1>
              <span className="text-xs text-slate-500 font-medium">Painel do Estudante</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isOnline ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {isOnline
                ? <><Wifi className="w-3.5 h-3.5 text-emerald-600" /><span>Online</span></>
                : <><WifiOff className="w-3.5 h-3.5 text-amber-600" /><span>Modo Offline</span></>
              }
            </div>
            <button
              onClick={logout}
              title="Sair da conta"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* Boas-vindas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Bem-vindo de volta,</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">{user?.name}</h2>
          <Link to="/quiz" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-bokken-pine text-white text-sm font-semibold">Iniciar quiz</Link>
        </div>

        {/* Focos */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-bokken-navy" />
              Meus Focos de Estudo
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Novo Foco
            </button>
          </div>

          {loadingFoci ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {fetchError}
            </div>
          ) : foci.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-16 text-center">
              <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Nenhum foco criado ainda.</p>
              <p className="text-slate-400 text-xs mt-1">Crie seu primeiro foco para começar a organizar seus estudos.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition"
              >
                <Plus className="w-4 h-4" /> Criar Primeiro Foco
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {foci.map(focus => (
                <div
                  key={focus.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition group"
                >
                  {/* Color + Name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: focus.color ?? '#1e3a8a' }}
                      />
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{focus.name}</h3>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        onClick={() => setEditFocus(focus)}
                        className="p-1.5 text-slate-400 hover:text-bokken-navy hover:bg-blue-50 rounded-lg transition"
                        title="Editar foco"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(focus.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Excluir foco"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {focus.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{focus.description}</p>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {focus.subjectsCount ?? 0} matéria{focus.subjectsCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {focus.questionsCount ?? 0} pergunta{focus.questionsCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <Link
                    to={`/foci/${focus.id}`}
                    className="mt-4 flex items-center gap-1 text-xs font-semibold text-bokken-navy hover:text-bokken-navy-accent transition"
                  >
                    Ver matérias <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 bg-white text-center text-xs text-slate-400">
        Bokken Estudos &copy; {new Date().getFullYear()} — Sessão de {user?.name}
      </footer>

      {/* Modal: Criar Foco */}
      {showCreate && (
        <Modal title="Novo Foco de Estudo" onClose={() => setShowCreate(false)}>
          <FocusForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            loading={formLoading}
          />
        </Modal>
      )}

      {/* Modal: Editar Foco */}
      {editFocus && (
        <Modal title="Editar Foco" onClose={() => setEditFocus(null)}>
          <FocusForm
            initial={editFocus}
            onSubmit={handleUpdate}
            onCancel={() => setEditFocus(null)}
            loading={formLoading}
          />
        </Modal>
      )}

      {/* Modal: Confirmar Exclusão */}
      {confirmDeleteId && (
        <Modal title="Excluir Foco" onClose={() => setConfirmDeleteId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Tem certeza? Esta ação excluirá o foco e todas as matérias e perguntas associadas a ele.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deletingId === confirmDeleteId ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
