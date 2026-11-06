import React, { useState } from 'react';
import { FocusWithCount } from '@bokken/shared';

interface FocusFormProps {
  initial?: Partial<FocusWithCount>;
  onSubmit: (data: { name: string; description?: string; color: string }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const COLOR_PRESETS = [
  '#1e3a8a', '#064e3b', '#7c3aed', '#b91c1c',
  '#d97706', '#0369a1', '#be185d', '#374151'
];

export const FocusForm: React.FC<FocusFormProps> = ({ initial, onSubmit, onCancel, loading }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? '#1e3a8a');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('O nome é obrigatório.'); return; }
    if (name.trim().length > 100) { setError('O nome deve ter no máximo 100 caracteres.'); return; }
    if (description && description.length > 500) { setError('A descrição deve ter no máximo 500 caracteres.'); return; }

    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined, color });
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar foco.');
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
          placeholder="Ex: Concurso Banco do Brasil"
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
          placeholder="Descrição opcional do foco..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Cor</label>
        <div className="flex gap-2 flex-wrap">
          {COLOR_PRESETS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition ${color === c ? 'border-slate-900 scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
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
          {loading ? 'Salvando...' : (initial?.id ? 'Atualizar' : 'Criar Foco')}
        </button>
      </div>
    </form>
  );
};
