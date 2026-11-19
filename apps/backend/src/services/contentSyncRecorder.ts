import { ContentSyncEntityType, ContentSyncOperation, Prisma } from '@prisma/client';
import type { ContentSyncChange, SyncedFocus, SyncedQuestion, SyncedSubject } from '@bokken/shared';

type Transaction = Prisma.TransactionClient;

export async function recordContentChange(
  tx: Transaction,
  change: {
    userId: string;
    entityType: ContentSyncEntityType;
    operation: ContentSyncOperation;
    entityId: string;
    parentId?: string | null;
    payload?: Prisma.InputJsonValue;
  }
): Promise<bigint> {
  const state = await tx.contentSyncState.upsert({
    where: { userId: change.userId },
    create: { userId: change.userId, lastSequence: 1n },
    update: { lastSequence: { increment: 1n } },
    select: { lastSequence: true }
  });

  await tx.contentSyncChange.create({
    data: {
      userId: change.userId,
      sequence: state.lastSequence,
      entityType: change.entityType,
      operation: change.operation,
      entityId: change.entityId,
      parentId: change.parentId ?? null,
      payload: change.payload
    }
  });

  return state.lastSequence;
}

export async function recordFocusUpsert(
  tx: Transaction,
  userId: string,
  focus: { id: string; name: string; description: string | null; color: string | null; createdAt: Date; updatedAt: Date }
): Promise<void> {
  const dto: SyncedFocus = {
    id: focus.id,
    name: focus.name,
    description: focus.description,
    color: focus.color,
    createdAt: focus.createdAt.toISOString(),
    updatedAt: focus.updatedAt.toISOString()
  };
  await recordContentChange(tx, {
    userId,
    entityType: ContentSyncEntityType.FOCUS,
    operation: ContentSyncOperation.UPSERT,
    entityId: focus.id,
    payload: { focus: dto }
  });
}

export async function recordSubjectUpsert(
  tx: Transaction,
  userId: string,
  subject: { id: string; focusId: string; name: string; description: string | null; createdAt: Date; updatedAt: Date }
): Promise<void> {
  const dto: SyncedSubject = {
    id: subject.id,
    focusId: subject.focusId,
    name: subject.name,
    description: subject.description,
    createdAt: subject.createdAt.toISOString(),
    updatedAt: subject.updatedAt.toISOString()
  };
  await recordContentChange(tx, {
    userId,
    entityType: ContentSyncEntityType.SUBJECT,
    operation: ContentSyncOperation.UPSERT,
    entityId: subject.id,
    parentId: subject.focusId,
    payload: { subject: dto }
  });
}

export async function recordQuestionUpsert(
  tx: Transaction,
  userId: string,
  question: {
    id: string;
    subjectId: string;
    type: string;
    statement: string;
    createdAt: Date;
    updatedAt: Date;
  },
  options: Array<{ id: string; text: string; orderIndex: number }>
): Promise<void> {
  const dto: SyncedQuestion = {
    id: question.id,
    subjectId: question.subjectId,
    type: question.type as SyncedQuestion['type'],
    statement: question.statement,
    options: options.map(({ id, text, orderIndex }) => ({ id, text, orderIndex })),
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString()
  };
  await recordContentChange(tx, {
    userId,
    entityType: ContentSyncEntityType.QUESTION,
    operation: ContentSyncOperation.UPSERT,
    entityId: question.id,
    parentId: question.subjectId,
    payload: { question: dto }
  });
}

export async function recordTombstone(
  tx: Transaction,
  change: {
    userId: string;
    entityType: ContentSyncEntityType;
    entityId: string;
    parentId?: string | null;
    deletedAt: Date;
  }
): Promise<void> {
  const deletedAt = change.deletedAt.toISOString();
  await recordContentChange(tx, {
    ...change,
    operation: ContentSyncOperation.TOMBSTONE,
    payload: { deletedAt }
  });
}
