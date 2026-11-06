import React, { useState } from 'react';
import { Question, QuestionType } from '@bokken/shared';
import { Plus, Trash2 } from 'lucide-react';

interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface QuestionFormData {
  subjectId: string;
  type: QuestionType;
  statement: string;
  explanation?: string;
  expectedAnswer?: string;
  options?: QuestionOption[];
}

interface QuestionFormProps {
  subjectId: string;
  initial?: Partial<Question>;
  onSubmit: (data: QuestionFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({
  subjectId,
  initial,
  onSubmit,
  onCancel,
  loading
}) => {
  const [type, setType] = useState<QuestionType>(initial?.type ?? QuestionType.MULTIPLE_CHOICE);
  const [statement, setStatement] = useState(initial?.statement ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [expectedAnswer, setExpectedAnswer] = useState(initial?.expectedAnswer ?? '');
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options?.map(o => ({ text: o.text, isCorrect: o.isCorrect })) ?? [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ]
  );
  const [error, setError] = useState('');

  const addOption = () => setOptions(prev => [...prev, { text: '', isCorrect: false }]);

  const removeOption = (idx: number) => {
    setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, field: keyof QuestionOption, value: string | boolean) => {
    setOptions(prev => prev.map((opt, i) => {
      if (i !== idx) {
        // Desmarca outras opções se selecionado como correto
        if (field === 'isCorrect' && value === true) {
          return { ...opt, isCorrect: false };
        }
        return opt;
      }
      return { ...opt, [field]: value };
    }));
  };

  const handleTypeChange = (newType: QuestionType) => {
    setType(newType);
    if (newType === QuestionType.MULTIPLE_CHOICE && options.length < 2) {
      setOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!statement.trim()) { setError('O enunciado é obrigatório.'); return; }

    if (type === QuestionType.MULTIPLE_CHOICE) {
      const filled = options.filter(o => o.text.trim().length > 0);
      if (filled.length < 2) { setError('Informe pelo menos 2 alternativas.'); return; }
      const correctCount = filled.filter(o => o.isCorrect).length;
      if (correctCount !== 1) { setError('Marque exatamente uma alternativa como correta.'); return; }
    }

    if (type === QuestionType.DISCURSIVE && !expectedAnswer.trim()) {
      setError('A resposta esperada é obrigatória para perguntas discursivas.');
      return;
    }

    const data: QuestionFormData = {
      subjectId,
      type,
      statement: statement.trim(),
      explanation: explanation.trim() || undefined,
      ...(type === QuestionType.DISCURSIVE && { expectedAnswer: expectedAnswer.trim() }),
      ...(type === QuestionType.MULTIPLE_CHOICE && {
        options: options
          .filter(o => o.text.trim().length > 0)
          .map((o, idx) => ({ text: o.text.trim(), isCorrect: o.isCorrect, orderIndex: idx }))
      })
    };

    try {
      await onSubmit(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar pergunta.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Tipo */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Pergunta</label>
        <div className="flex gap-3">
          {[
            { value: QuestionType.MULTIPLE_CHOICE, label: 'Múltipla Escolha' },
            { value: QuestionType.DISCURSIVE, label: 'Discursiva' }
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition ${
                type === opt.value
                  ? 'bg-bokken-navy text-white border-bokken-navy'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Enunciado */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Enunciado <span className="text-red-500">*</span>
        </label>
        <textarea
          value={statement}
          onChange={e => setStatement(e.target.value)}
          rows={3}
          placeholder="Digite o enunciado da pergunta..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent resize-none"
          autoFocus
        />
      </div>

      {/* Alternativas (Múltipla Escolha) */}
      {type === QuestionType.MULTIPLE_CHOICE && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Alternativas <span className="text-red-500">*</span>
            <span className="text-xs text-slate-400 font-normal ml-2">(marque a correta)</span>
          </label>
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={opt.isCorrect}
                  onChange={() => updateOption(idx, 'isCorrect', true)}
                  className="shrink-0 accent-bokken-navy"
                  title="Marcar como correta"
                />
                <input
                  type="text"
                  value={opt.text}
                  onChange={e => updateOption(idx, 'text', e.target.value)}
                  placeholder={`Alternativa ${idx + 1}`}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent ${
                    opt.isCorrect ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'
                  }`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition"
                    title="Remover alternativa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex items-center gap-1.5 text-sm text-bokken-navy hover:text-bokken-navy-accent font-medium"
            >
              <Plus className="w-4 h-4" /> Adicionar alternativa
            </button>
          )}
        </div>
      )}

      {/* Resposta Esperada (Discursiva) */}
      {type === QuestionType.DISCURSIVE && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Resposta Esperada <span className="text-red-500">*</span>
          </label>
          <textarea
            value={expectedAnswer}
            onChange={e => setExpectedAnswer(e.target.value)}
            rows={4}
            placeholder="Descreva a resposta esperada ou gabarito..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent resize-none"
          />
        </div>
      )}

      {/* Justificativa/Explicação (Opcional) */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Justificativa <span className="text-xs text-slate-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          rows={2}
          placeholder="Explicação adicional, contexto ou referência bibliográfica..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-bokken-navy focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
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
          {loading ? 'Salvando...' : (initial?.id ? 'Atualizar' : 'Criar Pergunta')}
        </button>
      </div>
    </form>
  );
};
