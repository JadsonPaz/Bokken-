import { prisma } from '../db/prisma.js';
import { Focus as PrismaFocus } from '@prisma/client';
import { Focus, FocusWithCount } from '@bokken/shared';
import { ContentSyncEntityType } from '@prisma/client';
import { recordFocusUpsert, recordTombstone } from '../services/contentSyncRecorder.js';

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
  findById(id: string, userId: string): Promise<FocusWithCount | null>;
  create(data: CreateFocusData): Promise<Focus>;
  update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
}

function serializeFocus(focus: PrismaFocus): Focus {
  return { ...focus, createdAt: focus.createdAt.toISOString(), updatedAt: focus.updatedAt.toISOString(), deletedAt: focus.deletedAt?.toISOString() ?? null };
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

  async findById(id: string, userId: string): Promise<FocusWithCount | null> {
    const focus = await prisma.focus.findFirst({
      where: {
        id,
        userId,
        deletedAt: null
      },
      include: {
        subjects: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, _count: { select: { questions: { where: { deletedAt: null } } } } }
        }
      }
    });
    if (!focus) return null;
    return {
      ...serializeFocus(focus),
      subjectsCount: focus.subjects.length,
      questionsCount: focus.subjects.reduce((n, s) => n + s._count.questions, 0)
    };
  }

  async create(data: CreateFocusData): Promise<Focus> {
    return prisma.$transaction(async (tx) => {
      const focus = await tx.focus.create({
        data: {
          userId: data.userId,
          name: data.name,
          description: data.description,
          color: data.color || '#1e3a8a'
        }
      });
      await recordFocusUpsert(tx, data.userId, focus);
      return serializeFocus(focus);
    });
  }

  async update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.focus.updateMany({
        where: { id, userId, deletedAt: null },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.color !== undefined && { color: data.color })
        }
      });
      if (result.count === 0) return null;

      const focus = await tx.focus.findUniqueOrThrow({ where: { id } });
      await recordFocusUpsert(tx, userId, focus);
      return serializeFocus(focus);
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
      const focusUpdated = await tx.focus.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: now, updatedAt: now }
      });
      if (focusUpdated.count === 0) return false;

      // 2. Busca matérias ativas
      const subjects = await tx.subject.findMany({
        where: { focusId: id, deletedAt: null },
        select: { id: true }
      });

      const subjectIds = subjects.map(s => s.id);

      if (subjectIds.length > 0) {
        const questions = await tx.question.findMany({
          where: { subjectId: { in: subjectIds }, deletedAt: null },
          select: { id: true, subjectId: true }
        });

        // 3. Marca perguntas e matérias como deletadas
        await tx.question.updateMany({
          where: { subjectId: { in: subjectIds }, deletedAt: null },
          data: { deletedAt: now, updatedAt: now }
        });
        for (const question of questions) {
          await recordTombstone(tx, {
            userId,
            entityType: ContentSyncEntityType.QUESTION,
            entityId: question.id,
            parentId: question.subjectId,
            deletedAt: now
          });
        }

        await tx.subject.updateMany({
          where: { id: { in: subjectIds }, deletedAt: null },
          data: { deletedAt: now, updatedAt: now }
        });
        for (const subject of subjects) {
          await recordTombstone(tx, {
            userId,
            entityType: ContentSyncEntityType.SUBJECT,
            entityId: subject.id,
            parentId: id,
            deletedAt: now
          });
        }
      }

      await recordTombstone(tx, {
        userId,
        entityType: ContentSyncEntityType.FOCUS,
        entityId: id,
        deletedAt: now
      });

      return true;
    });
  }
}

export class InMemoryFocusRepository implements IFocusRepository {
  public foci: PrismaFocus[] = [];
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

  async findById(id: string, userId: string): Promise<FocusWithCount | null> {
    const focus = this.foci.find(f => f.id === id && f.userId === userId && f.deletedAt === null);
    if (!focus) return null;
    const subjects = (this.subjectsRef || []).filter(subject => subject.focusId === id && subject.deletedAt === null);
    const subjectIds = subjects.map(subject => subject.id);
    const questionsCount = (this.questionsRef || []).filter(question => subjectIds.includes(question.subjectId) && question.deletedAt === null).length;
    return { ...serializeFocus(focus), subjectsCount: subjects.length, questionsCount };
  }

  async create(data: CreateFocusData): Promise<Focus> {
    const focus: PrismaFocus = {
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
    return serializeFocus(focus);
  }

  async update(id: string, userId: string, data: UpdateFocusData): Promise<Focus | null> {
    const index = this.foci.findIndex(f => f.id === id && f.userId === userId && f.deletedAt === null);
    if (index === -1) return null;

    const existing = this.foci[index];
    const updated: PrismaFocus = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
      updatedAt: new Date()
    };
    this.foci[index] = updated;
    return serializeFocus(updated);
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
