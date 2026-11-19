import { ContentSyncEntityType, ContentSyncOperation, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface ContentSyncRecord {
  sequence: bigint;
  entityType: ContentSyncEntityType;
  operation: ContentSyncOperation;
  entityId: string;
  parentId: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface IContentSyncRepository {
  getLastSequence(userId: string): Promise<bigint>;
  findChanges(userId: string, after: bigint, through: bigint, take: number): Promise<ContentSyncRecord[]>;
}

export class PrismaContentSyncRepository implements IContentSyncRepository {
  async getLastSequence(userId: string): Promise<bigint> {
    const state = await prisma.contentSyncState.findUnique({
      where: { userId },
      select: { lastSequence: true }
    });
    return state?.lastSequence ?? 0n;
  }

  async findChanges(userId: string, after: bigint, through: bigint, take: number): Promise<ContentSyncRecord[]> {
    if (through <= after) return [];
    return prisma.contentSyncChange.findMany({
      where: { userId, sequence: { gt: after, lte: through } },
      orderBy: { sequence: 'asc' },
      take,
      select: { sequence: true, entityType: true, operation: true, entityId: true, parentId: true, payload: true, createdAt: true }
    });
  }
}
