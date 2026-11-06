import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { FocusService } from '../services/focusService.js';
import { SubjectService } from '../services/subjectService.js';
import { QuestionService } from '../services/questionService.js';
import { InMemoryFocusRepository } from '../repositories/focusRepository.js';
import { InMemorySubjectRepository } from '../repositories/subjectRepository.js';
import { InMemoryQuestionRepository } from '../repositories/questionRepository.js';
import { QuestionType } from '@bokken/shared';
import { Focus } from '@prisma/client';

// ---- Helper: constrói um objeto Focus compatível com o tipo Prisma ----
function makeFocusObject(
  id: string,
  userId: string,
  name: string,
  deletedAt: Date | null = null
): Focus {
  const now = new Date();
  return {
    id,
    userId,
    name,
    description: null,
    color: '#1e3a8a',
    createdAt: now,
    updatedAt: now,
    deletedAt
  };
}

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

// ========================================================================
// FOCOS
// ========================================================================
describe('Etapa 3 — Gestão de Conteúdos: Focos', () => {
  let focusRepo: InMemoryFocusRepository;
  let focusService: FocusService;

  beforeEach(() => {
    focusRepo = new InMemoryFocusRepository();
    focusService = new FocusService(focusRepo);
  });

  it('1. Deve criar um foco com campos obrigatórios e opcionais', async () => {
    const focus = await focusService.createFocus(USER_A, {
      name: 'Concurso Banco do Brasil',
      description: 'Estudo para concurso BB 2026',
      color: '#1e3a8a'
    });

    assert.ok(focus.id, 'Foco deve ter ID gerado');
    assert.strictEqual(focus.name, 'Concurso Banco do Brasil');
    assert.strictEqual(focus.description, 'Estudo para concurso BB 2026');
    assert.strictEqual(focus.color, '#1e3a8a');
    assert.strictEqual(focus.userId, USER_A);
  });

  it('2. Deve listar apenas os focos do usuário autenticado', async () => {
    await focusService.createFocus(USER_A, { name: 'Foco A1' });
    await focusService.createFocus(USER_A, { name: 'Foco A2' });
    await focusService.createFocus(USER_B, { name: 'Foco B1' });

    const fociA = await focusService.listFoci(USER_A);
    assert.strictEqual(fociA.length, 2, 'Usuário A deve ver 2 focos');
    assert.ok(fociA.every(f => f.userId === USER_A), 'Todos os focos devem pertencer ao Usuário A');

    const fociB = await focusService.listFoci(USER_B);
    assert.strictEqual(fociB.length, 1, 'Usuário B deve ver 1 foco');
  });

  it('3. Deve buscar um foco pelo ID respeitando o proprietário', async () => {
    const created = await focusService.createFocus(USER_A, { name: 'Meu Foco' });

    const found = await focusService.getFocus(created.id, USER_A);
    assert.strictEqual(found.id, created.id);

    // Usuário B não pode acessar foco do Usuário A
    await assert.rejects(
      () => focusService.getFocus(created.id, USER_B),
      { name: 'AppError', statusCode: 404 }
    );
  });

  it('4. Deve atualizar um foco com campos parciais preservando os demais', async () => {
    const created = await focusService.createFocus(USER_A, {
      name: 'Foco Original',
      description: 'Descrição original',
      color: '#1e3a8a'
    });

    const updated = await focusService.updateFocus(created.id, USER_A, {
      name: 'Foco Atualizado'
    });

    assert.strictEqual(updated.name, 'Foco Atualizado');
    // description e color devem ser preservados (não foram passados)
    assert.strictEqual(updated.description, 'Descrição original');
  });

  it('5. Focos excluídos não aparecem na listagem', async () => {
    const f1 = await focusService.createFocus(USER_A, { name: 'Ativo' });
    const f2 = await focusService.createFocus(USER_A, { name: 'A ser excluído' });

    await focusService.deleteFocus(f2.id, USER_A);

    const foci = await focusService.listFoci(USER_A);
    assert.strictEqual(foci.length, 1);
    assert.strictEqual(foci[0].id, f1.id);
  });

  it('6. Soft delete do foco deve marcar matérias e perguntas em cascata', async () => {
    // Monta stores compartilhados
    const subjectsStore: { id: string; focusId: string; deletedAt: Date | null }[] = [];
    const questionsStore: { id: string; subjectId: string; deletedAt: Date | null }[] = [];

    const repo = new InMemoryFocusRepository(subjectsStore, questionsStore);
    const service = new FocusService(repo);

    const focus = await service.createFocus(USER_A, { name: 'Foco com Cascata' });

    const subjectId = crypto.randomUUID();
    subjectsStore.push({ id: subjectId, focusId: focus.id, deletedAt: null });

    const questionId = crypto.randomUUID();
    questionsStore.push({ id: questionId, subjectId, deletedAt: null });

    await service.deleteFocus(focus.id, USER_A);

    // Verifica cascata
    const focusRaw = repo.foci.find(f => f.id === focus.id);
    assert.ok(focusRaw?.deletedAt !== null, 'Foco deve ser marcado como deletado');

    const subjectRaw = subjectsStore.find(s => s.id === subjectId);
    assert.ok(subjectRaw?.deletedAt !== null, 'Matéria deve ser marcada como deletada em cascata');

    const questionRaw = questionsStore.find(q => q.id === questionId);
    assert.ok(questionRaw?.deletedAt !== null, 'Pergunta deve ser marcada como deletada em cascata');
  });
});

// ========================================================================
// MATÉRIAS
// ========================================================================
describe('Etapa 3 — Gestão de Conteúdos: Matérias', () => {
  let fociStore: Focus[];
  let subjectRepo: InMemorySubjectRepository;
  let subjectService: SubjectService;

  beforeEach(() => {
    fociStore = [];
    subjectRepo = new InMemorySubjectRepository(fociStore);
    subjectService = new SubjectService(subjectRepo);
  });

  function addFocus(id: string, userId: string, name: string) {
    const f = makeFocusObject(id, userId, name);
    fociStore.push(f);
    return f;
  }

  it('7. Deve criar matéria vinculada a um foco', async () => {
    const focusId = crypto.randomUUID();
    addFocus(focusId, USER_A, 'Foco Para Matéria');

    const subject = await subjectService.createSubject(USER_A, {
      focusId,
      name: 'Matemática',
      description: 'Álgebra e cálculo'
    });

    assert.ok(subject.id);
    assert.strictEqual(subject.name, 'Matemática');
    assert.strictEqual(subject.focusId, focusId);
  });

  it('8. Deve listar apenas matérias do foco especificado pertencente ao usuário', async () => {
    const focusAId = crypto.randomUUID();
    const focusBId = crypto.randomUUID();
    const focusOtherId = crypto.randomUUID();
    addFocus(focusAId, USER_A, 'Foco A');
    addFocus(focusBId, USER_A, 'Foco B');
    addFocus(focusOtherId, USER_B, 'Foco de B');

    await subjectService.createSubject(USER_A, { focusId: focusAId, name: 'Mat. A1' });
    await subjectService.createSubject(USER_A, { focusId: focusAId, name: 'Mat. A2' });
    await subjectService.createSubject(USER_A, { focusId: focusBId, name: 'Mat. B1' });

    const subjectsA = await subjectService.listSubjects(focusAId, USER_A);
    assert.strictEqual(subjectsA.length, 2);
    assert.ok(subjectsA.every(s => s.focusId === focusAId));
  });

  it('9. Não deve permitir criar matéria em foco de outro usuário', async () => {
    const focusOtherId = crypto.randomUUID();
    addFocus(focusOtherId, USER_B, 'Foco de B');

    await assert.rejects(
      () => subjectService.createSubject(USER_A, { focusId: focusOtherId, name: 'Matéria Intrusa' }),
      { name: 'AppError', statusCode: 404 }
    );
  });

  it('10. Não deve permitir acesso à matéria de outro usuário pelo ID', async () => {
    const focusAId = crypto.randomUUID();
    addFocus(focusAId, USER_A, 'Foco de A');

    const subject = await subjectService.createSubject(USER_A, { focusId: focusAId, name: 'Privada' });

    await assert.rejects(
      () => subjectService.getSubject(subject.id, USER_B),
      { name: 'AppError', statusCode: 404 }
    );
  });

  it('11. Deve excluir matéria logicamente sem afetar o foco', async () => {
    const focusId = crypto.randomUUID();
    addFocus(focusId, USER_A, 'Foco Pai');

    const s = await subjectService.createSubject(USER_A, { focusId, name: 'Matéria Temporária' });

    await subjectService.deleteSubject(s.id, USER_A);

    const subjects = await subjectService.listSubjects(focusId, USER_A);
    assert.strictEqual(subjects.length, 0, 'Matéria excluída não deve aparecer na listagem');

    // O foco ainda existe
    const focusRaw = fociStore.find(f => f.id === focusId);
    assert.ok(focusRaw, 'O foco não deve ser excluído');
    assert.strictEqual(focusRaw.deletedAt, null, 'O foco permanece ativo');
  });

  it('12. Soft delete de matéria deve excluir em cascata suas perguntas', async () => {
    const focusId = crypto.randomUUID();
    addFocus(focusId, USER_A, 'Foco Cascata Matéria');

    const questionsStore: { id: string; subjectId: string; deletedAt: Date | null }[] = [];
    const repoWithQ = new InMemorySubjectRepository(fociStore, questionsStore);
    const serviceWithQ = new SubjectService(repoWithQ);

    const subject = await serviceWithQ.createSubject(USER_A, { focusId, name: 'Matéria com Q' });

    const q1 = crypto.randomUUID();
    const q2 = crypto.randomUUID();
    questionsStore.push({ id: q1, subjectId: subject.id, deletedAt: null });
    questionsStore.push({ id: q2, subjectId: subject.id, deletedAt: null });

    await serviceWithQ.deleteSubject(subject.id, USER_A);

    assert.ok(questionsStore[0].deletedAt !== null, 'Pergunta 1 deve ser marcada como deletada');
    assert.ok(questionsStore[1].deletedAt !== null, 'Pergunta 2 deve ser marcada como deletada');
  });
});

// ========================================================================
// PERGUNTAS
// ========================================================================
describe('Etapa 3 — Gestão de Conteúdos: Perguntas', () => {
  let fociStore: { id: string; userId: string; deletedAt: Date | null }[];
  let subjectsStore: { id: string; focusId: string; deletedAt: Date | null }[];
  let questionRepo: InMemoryQuestionRepository;
  let questionService: QuestionService;
  let focusId: string;
  let subjectId: string;

  beforeEach(() => {
    focusId = crypto.randomUUID();
    subjectId = crypto.randomUUID();
    fociStore = [{ id: focusId, userId: USER_A, deletedAt: null }];
    subjectsStore = [{ id: subjectId, focusId, deletedAt: null }];
    questionRepo = new InMemoryQuestionRepository(subjectsStore, fociStore);
    questionService = new QuestionService(questionRepo);
  });

  it('13. Deve criar pergunta de múltipla escolha com opções válidas', async () => {
    const question = await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.MULTIPLE_CHOICE,
      statement: 'Qual é o maior planeta do sistema solar?',
      options: [
        { text: 'Marte', isCorrect: false },
        { text: 'Júpiter', isCorrect: true },
        { text: 'Saturno', isCorrect: false }
      ]
    });

    assert.ok(question.id);
    assert.strictEqual(question.type, QuestionType.MULTIPLE_CHOICE);
    assert.strictEqual(question.options?.length, 3);
    assert.strictEqual(question.options?.filter(o => o.isCorrect).length, 1);
  });

  it('14. Deve criar pergunta discursiva com resposta esperada', async () => {
    const question = await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'Explique o princípio da inércia.',
      expectedAnswer: 'Corpos em repouso tendem a permanecer em repouso, e corpos em movimento tendem a permanecer em movimento.'
    });

    assert.ok(question.id);
    assert.strictEqual(question.type, QuestionType.DISCURSIVE);
    assert.ok(question.expectedAnswer, 'Resposta esperada deve ser armazenada');
    assert.strictEqual(question.options?.length, 0, 'Discursiva não deve ter opções');
  });

  it('15. Múltipla escolha com menos de 2 alternativas deve ser rejeitada', async () => {
    await assert.rejects(
      () => questionService.createQuestion(USER_A, {
        subjectId,
        type: QuestionType.MULTIPLE_CHOICE,
        statement: 'Pergunta inválida?',
        options: [{ text: 'Única opção', isCorrect: true }]
      }),
      (err: any) => {
        const hasMsg = err.message?.includes('duas alternativas') || Array.isArray(err.issues);
        assert.ok(hasMsg, `Esperado erro sobre mínimo de alternativas, recebido: ${err.message}`);
        return true;
      }
    );
  });

  it('16. Múltipla escolha com mais de uma alternativa correta deve ser rejeitada', async () => {
    await assert.rejects(
      () => questionService.createQuestion(USER_A, {
        subjectId,
        type: QuestionType.MULTIPLE_CHOICE,
        statement: 'Duas corretas?',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
          { text: 'C', isCorrect: false }
        ]
      }),
      (err: any) => {
        const hasMsg = err.message?.includes('uma alternativa') || Array.isArray(err.issues);
        assert.ok(hasMsg, `Esperado erro sobre exatamente uma correta, recebido: ${err.message}`);
        return true;
      }
    );
  });

  it('17. Discursiva sem resposta esperada deve ser rejeitada', async () => {
    await assert.rejects(
      () => questionService.createQuestion(USER_A, {
        subjectId,
        type: QuestionType.DISCURSIVE,
        statement: 'Sem resposta esperada?'
      }),
      (err: any) => {
        const hasMsg = err.message?.includes('resposta esperada') || Array.isArray(err.issues);
        assert.ok(hasMsg, `Esperado erro de resposta esperada ausente, recebido: ${err.message}`);
        return true;
      }
    );
  });

  it('18. Isolamento: Usuário B não deve listar perguntas da matéria de A', async () => {
    await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'Pergunta privada de A.',
      expectedAnswer: 'Resposta de A.'
    });

    const listB = await questionService.listQuestions(subjectId, USER_B, {});
    assert.strictEqual(listB.items.length, 0, 'Usuário B não deve ver perguntas da matéria de A');
  });

  it('19. Isolamento: Usuário B não pode obter pergunta pelo ID de A', async () => {
    const question = await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'Pergunta secreta.',
      expectedAnswer: 'Resposta secreta.'
    });

    await assert.rejects(
      () => questionService.getQuestion(question.id, USER_B),
      { name: 'AppError', statusCode: 404 }
    );
  });

  it('20. Deve excluir pergunta logicamente sem excluir a matéria', async () => {
    const q = await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'Pergunta a excluir.',
      expectedAnswer: 'Resposta.'
    });

    await questionService.deleteQuestion(q.id, USER_A);

    const listing = await questionService.listQuestions(subjectId, USER_A, {});
    assert.strictEqual(listing.items.length, 0, 'Pergunta excluída não deve aparecer na listagem');

    const subjectStillExists = subjectsStore.find(s => s.id === subjectId);
    assert.ok(subjectStillExists, 'Matéria deve continuar existindo');
    assert.strictEqual(subjectStillExists.deletedAt, null, 'Matéria deve permanecer ativa');
  });

  it('21. Paginação de perguntas deve funcionar corretamente', async () => {
    for (let i = 1; i <= 5; i++) {
      await questionService.createQuestion(USER_A, {
        subjectId,
        type: QuestionType.DISCURSIVE,
        statement: `Pergunta ${i}`,
        expectedAnswer: `Resposta ${i}`
      });
    }

    const page1 = await questionService.listQuestions(subjectId, USER_A, { page: 1, limit: 3 });
    assert.strictEqual(page1.items.length, 3);
    assert.strictEqual(page1.total, 5);
    assert.strictEqual(page1.totalPages, 2);

    const page2 = await questionService.listQuestions(subjectId, USER_A, { page: 2, limit: 3 });
    assert.strictEqual(page2.items.length, 2);
  });

  it('22. Busca textual deve filtrar perguntas pelo enunciado', async () => {
    await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'O que é fotossíntese?',
      expectedAnswer: 'Processo de conversão de luz em energia pelas plantas.'
    });
    await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.DISCURSIVE,
      statement: 'Defina mitose.',
      expectedAnswer: 'Divisão celular que resulta em duas células idênticas.'
    });

    const result = await questionService.listQuestions(subjectId, USER_A, { search: 'fotos' });
    assert.strictEqual(result.items.length, 1);
    assert.ok(result.items[0].statement.includes('fotossíntese'));
  });

  it('23. Deve atualizar enunciado da pergunta preservando opções existentes', async () => {
    const q = await questionService.createQuestion(USER_A, {
      subjectId,
      type: QuestionType.MULTIPLE_CHOICE,
      statement: 'Capital do Brasil?',
      options: [
        { text: 'São Paulo', isCorrect: false },
        { text: 'Brasília', isCorrect: true }
      ]
    });

    const updated = await questionService.updateQuestion(q.id, USER_A, {
      statement: 'Qual é a capital do Brasil?'
    });

    assert.strictEqual(updated.statement, 'Qual é a capital do Brasil?');
    assert.strictEqual(updated.options?.length, 2, 'Opções devem ser preservadas');
  });
});
