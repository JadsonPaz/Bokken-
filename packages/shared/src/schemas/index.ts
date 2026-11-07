import { z } from 'zod';
import { QuestionType, DiscursiveAssessment, QuizMode } from '../types/index.js';

// ==========================================
// SCHEMAS DE AUTENTICAÇÃO
// ==========================================

export const registerUserSchema = z.object({
  name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  timezone: z.string().default('America/Sao_Paulo')
});

export const loginUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'A senha é obrigatória')
});

// ==========================================
// SCHEMAS DE CONTEÚDO
// ==========================================

export const createFocusSchema = z.object({
  name: z.string().min(1, 'O nome do foco é obrigatório').max(100),
  description: z.string().max(500).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor hexadecimal inválida').optional().nullable()
});

export const updateFocusSchema = createFocusSchema.partial();

export const createSubjectSchema = z.object({
  focusId: z.string().uuid('ID de foco inválido'),
  name: z.string().min(1, 'O nome da matéria é obrigatório').max(100),
  description: z.string().max(500).optional().nullable()
});

export const updateSubjectSchema = createSubjectSchema.omit({ focusId: true }).partial();

export const questionOptionSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1, 'O texto da alternativa é obrigatório'),
  isCorrect: z.boolean(),
  orderIndex: z.number().int().nonnegative().optional()
});

export const questionOptionSnapshotSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
  orderIndex: z.number().int().nonnegative()
});

export const questionSnapshotSchema = z.object({
  type: z.nativeEnum(QuestionType),
  statement: z.string().trim().min(3),
  explanation: z.string().nullable().optional(),
  expectedAnswer: z.string().nullable().optional(),
  options: z.array(questionOptionSnapshotSchema)
}).superRefine((snapshot, ctx) => {
  if (snapshot.type === QuestionType.MULTIPLE_CHOICE) {
    if (snapshot.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshots de múltipla escolha exigem pelo menos duas alternativas.', path: ['options'] });
    }
    if (snapshot.options.filter(option => option.isCorrect).length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshots de múltipla escolha exigem exatamente uma alternativa correta.', path: ['options'] });
    }
    if (snapshot.expectedAnswer !== undefined && snapshot.expectedAnswer !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshots de múltipla escolha não podem conter resposta esperada discursiva.', path: ['expectedAnswer'] });
    }
  }

  if (snapshot.type === QuestionType.DISCURSIVE) {
    if (!snapshot.expectedAnswer || snapshot.expectedAnswer.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshots discursivos exigem resposta esperada.', path: ['expectedAnswer'] });
    }
    if (snapshot.options.length !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshots discursivos não podem conter alternativas.', path: ['options'] });
    }
  }

  const positions = snapshot.options.map(option => option.orderIndex);
  if (new Set(positions).size !== positions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'As posições das alternativas devem ser únicas.', path: ['options'] });
  }
  const optionIds = snapshot.options.map(option => option.id);
  if (new Set(optionIds).size !== optionIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Os IDs das alternativas devem ser únicos.', path: ['options'] });
  }
});

export const baseQuestionSchema = z.object({
  subjectId: z.string().uuid('ID de matéria inválido'),
  type: z.nativeEnum(QuestionType),
  statement: z.string().trim().min(3, 'O enunciado deve ter no mínimo 3 caracteres'),
  explanation: z.string().max(2000).optional().nullable(),
  expectedAnswer: z.string().max(2000).optional().nullable(),
  options: z.array(questionOptionSchema).optional()
});

export const createQuestionSchema = baseQuestionSchema.superRefine((data, ctx) => {
  if (data.type === QuestionType.MULTIPLE_CHOICE) {
    if (!data.options || data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas de múltipla escolha devem ter no mínimo duas alternativas.',
        path: ['options']
      });
      return;
    }
    const correctCount = data.options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas de múltipla escolha devem ter exatamente uma alternativa correta.',
        path: ['options']
      });
    }
  }

  if (data.type === QuestionType.DISCURSIVE) {
    if (!data.expectedAnswer || data.expectedAnswer.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas discursivas exigem uma resposta esperada obrigatória.',
        path: ['expectedAnswer']
      });
    }
    if (data.options && data.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas discursivas não devem possuir alternativas de múltipla escolha.',
        path: ['options']
      });
    }
  }

  if (data.options) {
    validateUniqueOptionPositions(data.options, ctx);
  }
});

export const updateQuestionSchema = z.object({
  type: z.nativeEnum(QuestionType).optional(),
  statement: z.string().trim().min(3, 'O enunciado deve ter no mínimo 3 caracteres').optional(),
  explanation: z.string().max(2000).optional().nullable(),
  expectedAnswer: z.string().max(2000).optional().nullable(),
  options: z.array(questionOptionSchema).optional()
}).superRefine((data, ctx) => {
  if (data.type === QuestionType.MULTIPLE_CHOICE && data.options !== undefined) {
    if (data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas de múltipla escolha devem ter no mínimo duas alternativas.',
        path: ['options']
      });
    }
    const correctCount = data.options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas de múltipla escolha devem ter exatamente uma alternativa correta.',
        path: ['options']
      });
    }
  }

  if (data.type === QuestionType.DISCURSIVE) {
    if (data.expectedAnswer !== undefined && (!data.expectedAnswer || data.expectedAnswer.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas discursivas exigem uma resposta esperada obrigatória.',
        path: ['expectedAnswer']
      });
    }
    if (data.options && data.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Perguntas discursivas não devem possuir alternativas de múltipla escolha.',
        path: ['options']
      });
    }
  }

  if (data.options) {
    validateUniqueOptionPositions(data.options, ctx);
  }
});

function validateUniqueOptionPositions(options: { orderIndex?: number }[], ctx: z.RefinementCtx): void {
  const positions = options.map((option, index) => option.orderIndex ?? index);
  if (new Set(positions).size !== positions.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'As posições das alternativas devem ser únicas.',
      path: ['options']
    });
  }
}

// ==========================================
// SCHEMAS DE SESSÃO E TENTATIVAS
// ==========================================

export const quizSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  mode: z.nativeEnum(QuizMode),
  totalQuestions: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  totalIncorrect: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional().nullable()
});

export const questionAttemptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  questionId: z.string().uuid(),
  quizSessionId: z.string().uuid().optional().nullable(),
  isCorrect: z.boolean(),
  selectedOptionId: z.string().uuid().optional().nullable(),
  discursiveAssessment: z.nativeEnum(DiscursiveAssessment).optional().nullable(),
  timeSpentSeconds: z.number().int().nonnegative(),
  clientStudyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data civil inválido (esperado YYYY-MM-DD)'),
  clientTimezone: z.string().optional().nullable(),
  statementSnapshot: z.string().optional().nullable(),
  selectedOptionTextSnapshot: z.string().optional().nullable(),
  expectedAnswerSnapshot: z.string().optional().nullable(),
  questionSnapshot: questionSnapshotSchema,
  clientCreatedAt: z.string().datetime()
});

export const syncPushPayloadSchema = z.object({
  sessions: z.array(quizSessionSchema),
  attempts: z.array(questionAttemptSchema)
});
