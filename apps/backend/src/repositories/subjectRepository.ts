import { prisma } from '../db/prisma.js';
import { Subject as PrismaSubject } from '@prisma/client';
import { Subject, SubjectWithCount } from '@bokken/shared';
import { AppError } from '../utils/errors.js';

export interface CreateSubjectData {
  focusId: string;
  name: string;
  description?: string | null;
}

export interface UpdateSubjectData {
  name?: string;
  description?: string | null;
}

export interface ISubjectRepository {
  findAllByFocusId(focusId: string, userId: string): Promise<SubjectWithCount[]>;
  findById(id: string, userId: string): Promise<SubjectWithCount | null>;
  create(data: CreateSubjectData, userId: string): Promise<Subject>;
  update(id: string, userId: string, data: UpdateSubjectData): Promise<Subject | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
}

function serializeSubject(subject: PrismaSubject, questionsCount = 0): SubjectWithCount {
  return {
    id: subject.id,
    focusId: subject.focusId,
    name: subject.name,
    description: subject.description,
    createdAt: subject.createdAt.toISOString(),
    updatedAt: subject.updatedAt.toISOString(),
    deletedAt: subject.deletedAt?.toISOString() ?? null,
    questionsCount
  };
}

export class PrismaSubjectRepository implements ISubjectRepository {
  async findAllByFocusId(focusId: string, userId: string): Promise<SubjectWithCount[]> {
    // 1. Valida se o foco pertence ao usuário
    const focus = await prisma.focus.findFirst({
      where: { id: focusId, userId, deletedAt: null }
    });
    if (!focus) return [];

    const subjects = await prisma.subject.findMany({
      where: {
        focusId,
        deletedAt: null
      },
      include: {
        _count: {
          select: { questions: { where: { deletedAt: null } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return subjects.map(s => ({
      id: s.id,
      focusId: s.focusId,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
      questionsCount: s._count.questions
    }));
  }

  async findById(id: string, userId: string): Promise<SubjectWithCount | null> {
    const subject = await prisma.subject.findFirst({
      where: {
        id,
        deletedAt: null,
        focus: {
          userId,
          deletedAt: null
        }
      },
      include: { _count: { select: { questions: { where: { deletedAt: null } } } } }
    });

    if (!subject) return null;

    return serializeSubject(subject, subject._count.questions);
  }

  async create(data: CreateSubjectData, userId: string): Promise<Subject> {
    // Valida que o foco pertence ao usuário autenticado
    const focus = await prisma.focus.findFirst({
      where: { id: data.focusId, userId, deletedAt: null }
    });

    if (!focus) {
      throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    }

    return serializeSubject(await prisma.subject.create({
      data: {
        focusId: data.focusId,
        name: data.name,
        description: data.description
      }
    }));
  }

  async update(id: string, userId: string, data: UpdateSubjectData): Promise<Subject | null> {
    const subject = await prisma.subject.findFirst({
      where: {
        id,
        deletedAt: null,
        focus: { userId, deletedAt: null }
      }
    });

    if (!subject) return null;

    return serializeSubject(await prisma.subject.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description })
      }
    }));
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const subject = await tx.subject.findFirst({
        where: {
          id,
          deletedAt: null,
          focus: { userId, deletedAt: null }
        }
      });

      if (!subject) return false;

      const now = new Date();

      // 1. Marca matéria como deletada
      await tx.subject.update({
        where: { id },
        data: { deletedAt: now }
      });

      // 2. Marca todas as perguntas da matéria como deletadas
      await tx.question.updateMany({
        where: { subjectId: id, deletedAt: null },
        data: { deletedAt: now }
      });

      return true;
    });
  }
}

export class InMemorySubjectRepository implements ISubjectRepository {
  public subjects: PrismaSubject[] = [];
  public fociRef: import('@prisma/client').Focus[] = [];
  public questionsRef?: { id: string; subjectId: string; deletedAt: Date | null }[];

  constructor(
    fociRef: import('@prisma/client').Focus[] = [],
    questionsRef?: { id: string; subjectId: string; deletedAt: Date | null }[]
  ) {
    this.fociRef = fociRef;
    this.questionsRef = questionsRef;
  }

  async findAllByFocusId(focusId: string, userId: string): Promise<SubjectWithCount[]> {
    const focus = this.fociRef.find(f => f.id === focusId && f.userId === userId && f.deletedAt === null);
    if (!focus) return [];

    return this.subjects
      .filter(s => s.focusId === focusId && s.deletedAt === null)
      .map(s => {
        const questionsCount = (this.questionsRef || []).filter(q => q.subjectId === s.id && q.deletedAt === null).length;
        return {
          id: s.id,
          focusId: s.focusId,
          name: s.name,
          description: s.description,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
          questionsCount
        };
      });
  }

  async findById(id: string, userId: string): Promise<SubjectWithCount | null> {
    const subject = this.subjects.find(s => s.id === id && s.deletedAt === null);
    if (!subject) return null;

    const focus = this.fociRef.find(f => f.id === subject.focusId && f.userId === userId && f.deletedAt === null);
    if (!focus) return null;

    const questionsCount = (this.questionsRef || []).filter(q => q.subjectId === subject.id && q.deletedAt === null).length;

    return {
      ...serializeSubject(subject, questionsCount)
    };
  }

  async create(data: CreateSubjectData, userId: string): Promise<Subject> {
    const focus = this.fociRef.find(f => f.id === data.focusId && f.userId === userId && f.deletedAt === null);
    if (!focus) {
      throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    }

    const subject: PrismaSubject = {
      id: crypto.randomUUID(),
      focusId: data.focusId,
      name: data.name,
      description: data.description || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    };
    this.subjects.push(subject);
    return serializeSubject(subject);
  }

  async update(id: string, userId: string, data: UpdateSubjectData): Promise<Subject | null> {
    const subject = this.subjects.find(s => s.id === id && s.deletedAt === null);
    if (!subject) return null;

    const focus = this.fociRef.find(f => f.id === subject.focusId && f.userId === userId && f.deletedAt === null);
    if (!focus) return null;

    if (data.name !== undefined) subject.name = data.name;
    if (data.description !== undefined) subject.description = data.description;
    subject.updatedAt = new Date();

    return serializeSubject(subject);
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const subject = this.subjects.find(s => s.id === id && s.deletedAt === null);
    if (!subject) return false;

    const focus = this.fociRef.find(f => f.id === subject.focusId && f.userId === userId && f.deletedAt === null);
    if (!focus) return false;

    const now = new Date();
    subject.deletedAt = now;

    if (this.questionsRef) {
      this.questionsRef
        .filter(q => q.subjectId === id && q.deletedAt === null)
        .forEach(q => { q.deletedAt = now; });
    }

    return true;
  }
}
