import {
  contentSyncPageSchema,
  type ContentSyncChange,
  type ContentSyncPage
} from '@bokken/shared';
import { db, type BokkenDatabase } from './index.js';

export class ActiveAccountChangedError extends Error {
  constructor() {
    super('A conta ativa mudou durante a sincronização de conteúdo.');
    this.name = 'ActiveAccountChangedError';
  }
}

export class StaleContentSyncPageError extends Error {
  constructor() {
    super('Uma página de sincronização mais recente já foi persistida.');
    this.name = 'StaleContentSyncPageError';
  }
}

/** Applies a validated page and its opaque cursor atomically for the still-active account. */
export async function applyContentSyncPageForActiveAccount(
  expectedUserId: string,
  expectedCursor: string | null,
  input: ContentSyncPage,
  database: BokkenDatabase = db
): Promise<ContentSyncPage> {
  const page = contentSyncPageSchema.parse(input);

  await database.transaction(
    'rw',
    database.session,
    database.foci,
    database.subjects,
    database.questions,
    database.syncCursors,
    async () => {
      const activeSession = await database.session.get('active_session');
      if (!activeSession || activeSession.userId !== expectedUserId) throw new ActiveAccountChangedError();

      const cursorKey: [string, 'content'] = [expectedUserId, 'content'];
      const storedCursor = await database.syncCursors.get(cursorKey);
      if ((storedCursor?.cursor ?? null) !== expectedCursor) throw new StaleContentSyncPageError();

      const cachedAt = Date.now();
      for (const change of page.changes) {
        await applyChange(change, expectedUserId, cachedAt, database);
      }

      await database.syncCursors.put({
        userId: expectedUserId,
        scope: 'content',
        cursor: page.nextCursor,
        updatedAt: cachedAt
      });
    }
  );

  return page;
}

async function applyChange(
  change: ContentSyncChange,
  userId: string,
  cachedAt: number,
  database: BokkenDatabase
): Promise<void> {
  switch (change.kind) {
    case 'FOCUS_UPSERT':
      await database.foci.put({ ...change.focus, userId, deletedAt: null, cachedAt });
      return;
    case 'SUBJECT_UPSERT':
      await database.subjects.put({ ...change.subject, userId, deletedAt: null, cachedAt });
      return;
    case 'QUESTION_UPSERT':
      await database.questions.put({ ...change.question, userId, deletedAt: null, cachedAt });
      return;
    case 'FOCUS_TOMBSTONE':
      await database.foci.delete([userId, change.id]);
      return;
    case 'SUBJECT_TOMBSTONE':
      await database.subjects.delete([userId, change.id]);
      return;
    case 'QUESTION_TOMBSTONE':
      await database.questions.delete([userId, change.id]);
      return;
  }
}
