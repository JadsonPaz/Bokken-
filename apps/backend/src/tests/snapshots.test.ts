import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Question, QuestionType, createQuestionSnapshot, questionSnapshotSchema } from '@bokken/shared';

const validOption = (text: string, isCorrect: boolean, orderIndex: number, id = crypto.randomUUID()) => ({
  id,
  questionId: crypto.randomUUID(),
  text,
  isCorrect,
  orderIndex,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const multipleChoice = (overrides: Partial<Question> = {}): Question => ({
  id: crypto.randomUUID(),
  subjectId: crypto.randomUUID(),
  type: QuestionType.MULTIPLE_CHOICE,
  statement: 'Escolha uma resposta válida.',
  explanation: 'Justificativa da questão.',
  expectedAnswer: null,
  options: [
    validOption('Alternativa A', true, 0),
    validOption('Alternativa B', false, 1)
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

describe('Snapshots de questões', () => {
  it('cria e valida snapshot completo de múltipla escolha', () => {
    const question = multipleChoice();
    const snapshot = createQuestionSnapshot(question);
    assert.deepStrictEqual(snapshot, questionSnapshotSchema.parse(snapshot));
    assert.strictEqual(snapshot.options.length, 2);
    assert.strictEqual(snapshot.options.filter(option => option.isCorrect).length, 1);
    assert.strictEqual(snapshot.expectedAnswer, null);
  });

  it('cria e valida snapshot discursivo com resposta esperada', () => {
    const question = multipleChoice({
      type: QuestionType.DISCURSIVE,
      statement: 'Explique o conceito de inércia.',
      expectedAnswer: 'Um corpo preserva seu estado de movimento ou repouso.',
      options: []
    });
    const snapshot = createQuestionSnapshot(question);
    assert.deepStrictEqual(snapshot, questionSnapshotSchema.parse(snapshot));
    assert.deepStrictEqual(snapshot.options, []);
    assert.strictEqual(snapshot.expectedAnswer, question.expectedAnswer);
  });

  it('rejeita snapshots de múltipla escolha incompletos ou incompatíveis', () => {
    const base = createQuestionSnapshot(multipleChoice());
    const invalidSnapshots = [
      { ...base, options: [] },
      { ...base, options: [{ ...base.options[0], isCorrect: false }, { ...base.options[1], isCorrect: false }] },
      { ...base, options: [base.options[0], { ...base.options[1], isCorrect: true }] },
      { ...base, options: [base.options[0], { ...base.options[1], orderIndex: 0 }] },
      { ...base, options: [base.options[0], { ...base.options[1], id: base.options[0].id }] },
      { ...base, options: [base.options[0], { ...base.options[1], id: 'invalid-uuid' }] },
      { ...base, options: [base.options[0], { ...base.options[1], text: '   ' }] },
      { ...base, options: [base.options[0], { ...base.options[1], orderIndex: -1 }] },
      { ...base, expectedAnswer: 'Gabarito discursivo incompatível' }
    ];

    for (const [index, snapshot] of invalidSnapshots.entries()) {
      assert.throws(() => createQuestionSnapshot(multipleChoice({
        options: snapshot.options.map(option => ({ ...option, questionId: crypto.randomUUID(), createdAt: '', updatedAt: '' })),
        expectedAnswer: snapshot.expectedAnswer
      } as Partial<Question>)), `O helper deve rejeitar conteúdo inválido (caso ${index + 1})`);
      assert.strictEqual(questionSnapshotSchema.safeParse(snapshot).success, false, `Schema deve rejeitar caso ${index + 1}`);
    }
    assert.strictEqual(questionSnapshotSchema.safeParse({ type: QuestionType.MULTIPLE_CHOICE, options: base.options }).success, false, 'Enunciado incompleto deve ser rejeitado');
  });

  it('rejeita helper de múltipla escolha sem opções incluídas', () => {
    assert.throws(() => createQuestionSnapshot(multipleChoice({ options: undefined })));
  });

  it('rejeita snapshots discursivos sem resposta ou com alternativas', () => {
    const base = createQuestionSnapshot(multipleChoice({
      type: QuestionType.DISCURSIVE,
      statement: 'Descreva a resposta esperada.',
      expectedAnswer: 'Resposta completa.',
      options: []
    }));
    const invalidSnapshots = [
      { ...base, expectedAnswer: null },
      { ...base, expectedAnswer: '   ' },
      { ...base, options: [validOption('Alternativa indevida', false, 0)] }
    ];

    for (const snapshot of invalidSnapshots) {
      assert.strictEqual(questionSnapshotSchema.safeParse(snapshot).success, false);
      assert.throws(() => createQuestionSnapshot(multipleChoice({
        type: snapshot.type,
        statement: snapshot.statement,
        expectedAnswer: snapshot.expectedAnswer,
        options: snapshot.options.map(option => ({ ...option, questionId: crypto.randomUUID(), createdAt: '', updatedAt: '' }))
      } as Partial<Question>)));
    }
  });
});
