import { prisma } from '../db/prisma.js';
import { Question as PrismaQuestion, QuestionOption as PrismaQuestionOption, QuestionType as PrismaQuestionType } from '@prisma/client';
import { Question, QuestionOption, QuestionType, PaginatedResponse } from '@bokken/shared';
import { AppError } from '../utils/errors.js';

export interface CreateQuestionOptionData {
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface CreateQuestionData {
  subjectId: string;
  type: QuestionType;
  statement: string;
  explanation?: string | null;
  expectedAnswer?: string | null;
  options?: CreateQuestionOptionData[];
}

export interface UpdateQuestionData {
  type?: QuestionType;
  statement?: string;
  explanation?: string | null;
  expectedAnswer?: string | null;
  options?: CreateQuestionOptionData[];
}

export interface IQuestionRepository {
  findAllBySubjectId(
    subjectId: string,
    userId: string,
    params: { search?: string; page?: number; limit?: number }
  ): Promise<PaginatedResponse<Question>>;
  findById(id: string, userId: string): Promise<Question | null>;
  create(data: CreateQuestionData, userId: string): Promise<Question>;
  update(id: string, userId: string, data: UpdateQuestionData): Promise<Question | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
}

function mapPrismaQuestionToShared(q: PrismaQuestion & { options?: PrismaQuestionOption[] }): Question {
  return {
    id: q.id,
    subjectId: q.subjectId,
    type: q.type as unknown as QuestionType,
    statement: q.statement,
    explanation: q.explanation,
    expectedAnswer: q.expectedAnswer,
    options: q.options
      ? q.options.map(o => ({
          id: o.id,
          questionId: o.questionId,
          text: o.text,
          isCorrect: o.isCorrect,
          orderIndex: o.orderIndex,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString()
        }))
      : [],
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    deletedAt: q.deletedAt ? q.deletedAt.toISOString() : null
  };
}

export class PrismaQuestionRepository implements IQuestionRepository {
  async findAllBySubjectId(
    subjectId: string,
    userId: string,
    params: { search?: string; page?: number; limit?: number }
  ): Promise<PaginatedResponse<Question>> {
    // 1. Valida se a matéria pertence ao usuário
    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        deletedAt: null,
        focus: { userId, deletedAt: null }
      }
    });

    if (!subject) {
      return { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 10));
    const skip = (page - 1) * limit;

    const where: any = {
      subjectId,
      deletedAt: null
    };

    if (params.search && params.search.trim().length > 0) {
      where.statement = {
        contains: params.search.trim(),
        mode: 'insensitive'
      };
    }

    const [total, rawQuestions] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        include: {
          options: {
            where: { retiredAt: null },
            orderBy: { orderIndex: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    const items = rawQuestions.map(mapPrismaQuestionToShared);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages
    };
  }

  async findById(id: string, userId: string): Promise<Question | null> {
    const question = await prisma.question.findFirst({
      where: {
        id,
        deletedAt: null,
        subject: {
          deletedAt: null,
          focus: { userId, deletedAt: null }
        }
      },
      include: {
        options: {
          where: { retiredAt: null },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!question) return null;
    return mapPrismaQuestionToShared(question);
  }

  async create(data: CreateQuestionData, userId: string): Promise<Question> {
    // Valida posse da matéria
    const subject = await prisma.subject.findFirst({
      where: {
        id: data.subjectId,
        deletedAt: null,
        focus: { userId, deletedAt: null }
      }
    });

    if (!subject) {
      throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }

    return prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          subjectId: data.subjectId,
          type: data.type as unknown as PrismaQuestionType,
          statement: data.statement,
          explanation: data.explanation || null,
          expectedAnswer: data.type === QuestionType.DISCURSIVE ? data.expectedAnswer : null
        }
      });

      let createdOptions: PrismaQuestionOption[] = [];
      if (data.type === QuestionType.MULTIPLE_CHOICE && data.options && data.options.length > 0) {
        await tx.questionOption.createMany({
          data: data.options.map((opt, idx) => ({
            questionId: question.id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            orderIndex: opt.orderIndex ?? idx
          }))
        });

        createdOptions = await tx.questionOption.findMany({
          where: { questionId: question.id },
          orderBy: { orderIndex: 'asc' }
        });
      }

      return mapPrismaQuestionToShared({ ...question, options: createdOptions });
    });
  }

  async update(id: string, userId: string, data: UpdateQuestionData): Promise<Question | null> {
    // 1. Verifica posse e existência
    const existing = await prisma.question.findFirst({
      where: {
        id,
        deletedAt: null,
        subject: {
          deletedAt: null,
          focus: { userId, deletedAt: null }
        }
      },
      include: { options: { where: { retiredAt: null } } }
    });

    if (!existing) return null;

    return prisma.$transaction(async (tx) => {
      const newType = data.type ?? (existing.type as unknown as QuestionType);

      // Atualiza campos da questão
      const updatedQuestion = await tx.question.update({
        where: { id },
        data: {
          ...(data.type !== undefined && { type: data.type as unknown as PrismaQuestionType }),
          ...(data.statement !== undefined && { statement: data.statement }),
          ...(data.explanation !== undefined && { explanation: data.explanation }),
          expectedAnswer: newType === QuestionType.DISCURSIVE
            ? (data.expectedAnswer !== undefined ? data.expectedAnswer : existing.expectedAnswer)
            : null
        }
      });

      // Se virou discursiva, remove opções antigas
      if (newType === QuestionType.DISCURSIVE) {
        await tx.questionOption.updateMany({
          where: { questionId: id, retiredAt: null },
          data: { retiredAt: new Date() }
        });
      } else if (newType === QuestionType.MULTIPLE_CHOICE && data.options !== undefined) {
        // Preserve IDs referenciados por tentativas e mantenha versões antigas arquivadas.
        await tx.questionOption.updateMany({
          where: { questionId: id, retiredAt: null },
          data: { retiredAt: new Date() }
        });

        await tx.questionOption.createMany({
          data: data.options.map((opt, idx) => ({
            questionId: id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            orderIndex: opt.orderIndex ?? idx
          }))
        });
      }

      const finalOptions = await tx.questionOption.findMany({
        where: { questionId: id, retiredAt: null },
        orderBy: { orderIndex: 'asc' }
      });

      return mapPrismaQuestionToShared({ ...updatedQuestion, options: finalOptions });
    });
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const question = await prisma.question.findFirst({
      where: {
        id,
        deletedAt: null,
        subject: {
          deletedAt: null,
          focus: { userId, deletedAt: null }
        }
      }
    });

    if (!question) return false;

    await prisma.question.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return true;
  }
}

export class InMemoryQuestionRepository implements IQuestionRepository {
  public questions: (Question & { deletedAtDate: Date | null })[] = [];
  public archivedOptions: QuestionOption[] = [];
  public subjectsRef: { id: string; focusId: string; deletedAt: Date | null }[] = [];
  public fociRef: { id: string; userId: string; deletedAt: Date | null }[] = [];

  constructor(
    subjectsRef: { id: string; focusId: string; deletedAt: Date | null }[] = [],
    fociRef: { id: string; userId: string; deletedAt: Date | null }[] = []
  ) {
    this.subjectsRef = subjectsRef;
    this.fociRef = fociRef;
  }

  private isOwner(subjectId: string, userId: string): boolean {
    const subject = this.subjectsRef.find(s => s.id === subjectId && s.deletedAt === null);
    if (!subject) return false;
    const focus = this.fociRef.find(f => f.id === subject.focusId && f.userId === userId && f.deletedAt === null);
    return Boolean(focus);
  }

  async findAllBySubjectId(
    subjectId: string,
    userId: string,
    params: { search?: string; page?: number; limit?: number }
  ): Promise<PaginatedResponse<Question>> {
    if (!this.isOwner(subjectId, userId)) {
      return { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 10));

    let filtered = this.questions.filter(q => q.subjectId === subjectId && q.deletedAtDate === null);

    if (params.search && params.search.trim().length > 0) {
      const term = params.search.trim().toLowerCase();
      filtered = filtered.filter(q => q.statement.toLowerCase().includes(term));
    }

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const items = filtered.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    return { items, total, page, limit, totalPages };
  }

  async findById(id: string, userId: string): Promise<Question | null> {
    const q = this.questions.find(q => q.id === id && q.deletedAtDate === null);
    if (!q) return null;
    if (!this.isOwner(q.subjectId, userId)) return null;
    return { ...q };
  }

  async create(data: CreateQuestionData, userId: string): Promise<Question> {
    if (!this.isOwner(data.subjectId, userId)) {
      throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }

    const qId = crypto.randomUUID();
    const now = new Date();

    const options: QuestionOption[] = (data.options || []).map((opt, idx) => ({
      id: crypto.randomUUID(),
      questionId: qId,
      text: opt.text,
      isCorrect: opt.isCorrect,
      orderIndex: opt.orderIndex ?? idx,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }));

    const question: Question & { deletedAtDate: Date | null } = {
      id: qId,
      subjectId: data.subjectId,
      type: data.type,
      statement: data.statement,
      explanation: data.explanation || null,
      expectedAnswer: data.type === QuestionType.DISCURSIVE ? data.expectedAnswer || null : null,
      options: data.type === QuestionType.MULTIPLE_CHOICE ? options : [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
      deletedAtDate: null
    };

    this.questions.push(question);
    return question;
  }

  async update(id: string, userId: string, data: UpdateQuestionData): Promise<Question | null> {
    const index = this.questions.findIndex(q => q.id === id && q.deletedAtDate === null);
    if (index === -1) return null;

    const existing = this.questions[index];
    if (!this.isOwner(existing.subjectId, userId)) return null;

    const newType = data.type ?? existing.type;
    const now = new Date();

    let updatedOptions = existing.options;
    if (newType === QuestionType.DISCURSIVE) {
      this.archivedOptions.push(...(existing.options ?? []));
      updatedOptions = [];
    } else if (data.options !== undefined) {
      this.archivedOptions.push(...(existing.options ?? []));
      updatedOptions = data.options.map((opt, idx) => ({
        id: crypto.randomUUID(),
        questionId: id,
        text: opt.text,
        isCorrect: opt.isCorrect,
        orderIndex: opt.orderIndex ?? idx,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }));
    }

    const updated: Question & { deletedAtDate: Date | null } = {
      ...existing,
      type: newType,
      statement: data.statement !== undefined ? data.statement : existing.statement,
      explanation: data.explanation !== undefined ? data.explanation : existing.explanation,
      expectedAnswer: newType === QuestionType.DISCURSIVE
        ? (data.expectedAnswer !== undefined ? data.expectedAnswer : existing.expectedAnswer)
        : null,
      options: updatedOptions,
      updatedAt: now.toISOString()
    };

    this.questions[index] = updated;
    return updated;
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const q = this.questions.find(q => q.id === id && q.deletedAtDate === null);
    if (!q) return false;
    if (!this.isOwner(q.subjectId, userId)) return false;

    q.deletedAtDate = new Date();
    q.deletedAt = q.deletedAtDate.toISOString();
    return true;
  }
}
