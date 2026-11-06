import React, { useState } from 'react';
import { SubjectWithCount } from '@bokken/shared';

interface SubjectFormProps {
  initial?: Partial<SubjectWithCount>;
  focusId: string;
  onSubmit: (data: { name: string; description?: string; focusId: string }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const SubjectForm: React.FC<SubjectFormProps> = ({ initial, focusId, onSubmit, onCancel, loading }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('O nome é obrigatório.'); return; }
    if (name.trim().length > 100) { setError('O nome deve ter no máximo 100 caracteres.'); return; }
    if (description && description.length > 500) { setError('A descrição deve ter no máximo 500 caracteres.'); return; }

    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined, focusId });
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar matéria.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Nome <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          placeholder="Ex: Matemática Financeira"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Descrição opcional da matéria..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-lg bg-bokken-navy text-white text-sm font-semibold hover:bg-bokken-navy-accent transition disabled:opacity-50"
        >
          {loading ? 'Salvando...' : (initial?.id ? 'Atualizar' : 'Criar Matéria')}
        </button>
      </div>
    </form>
  );
};
