import { prisma } from '../db/prisma.js';
import { Focus, Subject } from '@prisma/client';
import { FocusWithCount } from '@bokken/shared';

export interface CreateFocusData {
  userId: string;
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface UpdateFocusData {
  name?: string;
  description?: string | null;
  color?: string | null;
}

export interface IFocusRepository {
  findAllByUserId(userId: string): Promise<FocusWithCount[]>;
  findById(id: string, userId: string): Promise<(Focus & { subjects?: Subject[] }) | null>;
  create(data: CreateFocusData): Promise<Focus>;
  update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
}

export class PrismaFocusRepository implements IFocusRepository {
  async findAllByUserId(userId: string): Promise<FocusWithCount[]> {
    const foci = await prisma.focus.findMany({
      where: {
        userId,
        deletedAt: null
      },
      include: {
        subjects: {
          where: { deletedAt: null },
          select: {
            id: true,
            _count: {
              select: { questions: { where: { deletedAt: null } } }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return foci.map(f => {
      const subjectsCount = f.subjects.length;
      const questionsCount = f.subjects.reduce((acc, s) => acc + s._count.questions, 0);

      return {
        id: f.id,
        userId: f.userId,
        name: f.name,
        description: f.description,
        color: f.color,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
        subjectsCount,
        questionsCount
      };
    });
  }

  async findById(id: string, userId: string): Promise<(Focus & { subjects?: Subject[] }) | null> {
    return prisma.focus.findFirst({
      where: {
        id,
        userId,
        deletedAt: null
      },
      include: {
        subjects: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async create(data: CreateFocusData): Promise<Focus> {
    return prisma.focus.create({
      data: {
        userId: data.userId,
        name: data.name,
        description: data.description,
        color: data.color || '#1e3a8a'
      }
    });
  }

  async update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null> {
    const focus = await prisma.focus.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!focus) return null;

    return prisma.focus.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color })
      }
    });
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const focus = await tx.focus.findFirst({
        where: { id, userId, deletedAt: null }
      });

      if (!focus) return false;

      const now = new Date();

      // 1. Marca foco como deletado
      await tx.focus.update({
        where: { id },
        data: { deletedAt: now }
      });

      // 2. Busca matérias ativas
      const subjects = await tx.subject.findMany({
        where: { focusId: id, deletedAt: null },
        select: { id: true }
      });

      const subjectIds = subjects.map(s => s.id);

      if (subjectIds.length > 0) {
        // 3. Marca matérias como deletadas
        await tx.subject.updateMany({
          where: { id: { in: subjectIds } },
          data: { deletedAt: now }
        });

        // 4. Marca perguntas das matérias como deletadas
        await tx.question.updateMany({
          where: { subjectId: { in: subjectIds }, deletedAt: null },
          data: { deletedAt: now }
        });
      }

      return true;
    });
  }
}

export class InMemoryFocusRepository implements IFocusRepository {
  public foci: Focus[] = [];
  public subjectsRef?: { id: string; focusId: string; deletedAt: Date | null }[];
  public questionsRef?: { id: string; subjectId: string; deletedAt: Date | null }[];

  constructor(
    subjectsRef?: { id: string; focusId: string; deletedAt: Date | null }[],
    questionsRef?: { id: string; subjectId: string; deletedAt: Date | null }[]
  ) {
    this.subjectsRef = subjectsRef;
    this.questionsRef = questionsRef;
  }

  async findAllByUserId(userId: string): Promise<FocusWithCount[]> {
    return this.foci
      .filter(f => f.userId === userId && f.deletedAt === null)
      .map(f => {
        const subjects = (this.subjectsRef || []).filter(s => s.focusId === f.id && s.deletedAt === null);
        const subjectIds = subjects.map(s => s.id);
        const questionsCount = (this.questionsRef || []).filter(q => subjectIds.includes(q.subjectId) && q.deletedAt === null).length;

        return {
          id: f.id,
          userId: f.userId,
          name: f.name,
          description: f.description,
          color: f.color,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
          deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
          subjectsCount: subjects.length,
          questionsCount
        };
      });
  }

  async findById(id: string, userId: string): Promise<(Focus & { subjects?: Subject[] }) | null> {
    const focus = this.foci.find(f => f.id === id && f.userId === userId && f.deletedAt === null);
    if (!focus) return null;
    return { ...focus };
  }

  async create(data: CreateFocusData): Promise<Focus> {
    const focus: Focus = {
      id: crypto.randomUUID(),
      userId: data.userId,
      name: data.name,
      description: data.description || null,
      color: data.color || '#1e3a8a',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    };
    this.foci.push(focus);
    return focus;
  }

  async update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null> {
    const index = this.foci.findIndex(f => f.id === id && f.userId === userId && f.deletedAt === null);
    if (index === -1) return null;

    const existing = this.foci[index];
    const updated: Focus = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
      updatedAt: new Date()
    };
    this.foci[index] = updated;
    return updated;
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const focus = this.foci.find(f => f.id === id && f.userId === userId && f.deletedAt === null);
    if (!focus) return false;

    const now = new Date();
    focus.deletedAt = now;

    if (this.subjectsRef) {
      const subjects = this.subjectsRef.filter(s => s.focusId === id && s.deletedAt === null);
      subjects.forEach(s => {
        s.deletedAt = now;
        if (this.questionsRef) {
          this.questionsRef
            .filter(q => q.subjectId === s.id && q.deletedAt === null)
            .forEach(q => { q.deletedAt = now; });
        }
      });
    }

    return true;
  }
}
