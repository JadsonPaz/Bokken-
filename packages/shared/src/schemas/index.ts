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
  text: z.string().min(1, 'O texto da alternativa é obrigatório'),
  isCorrect: z.boolean(),
  orderIndex: z.number().int().nonnegative()
});

export const baseQuestionSchema = z.object({
  subjectId: z.string().uuid('ID de matéria inválido'),
  type: z.nativeEnum(QuestionType),
  statement: z.string().min(3, 'O enunciado deve ter no mínimo 3 caracteres'),
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
});

export const updateQuestionSchema = z.object({
  type: z.nativeEnum(QuestionType).optional(),
  statement: z.string().min(3, 'O enunciado deve ter no mínimo 3 caracteres').optional(),
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
});

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
  clientCreatedAt: z.string().datetime()
});

export const syncPushPayloadSchema = z.object({
  sessions: z.array(quizSessionSchema),
  attempts: z.array(questionAttemptSchema)
});
