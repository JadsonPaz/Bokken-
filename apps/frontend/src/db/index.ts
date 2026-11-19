import Dexie, { type Table } from 'dexie';
import type {
  LocalFocus,
  LocalOutboxOperation,
  LocalQuestion,
  LocalQuizSession,
  LocalQuizSessionQuestion,
  LocalSession,
  LocalSubject,
  LocalSyncCursor
} from './types.js';

export type { LocalSession } from './types.js';

export class BokkenDatabase extends Dexie {
  session!: Table<LocalSession, string>;
  foci!: Table<LocalFocus, [string, string]>;
  subjects!: Table<LocalSubject, [string, string]>;
  questions!: Table<LocalQuestion, [string, string]>;
  quizSessions!: Table<LocalQuizSession, [string, string]>;
  quizSessionQuestions!: Table<LocalQuizSessionQuestion, [string, string]>;
  syncCursors!: Table<LocalSyncCursor, [string, string]>;
  outbox!: Table<LocalOutboxOperation, [string, string]>;

  constructor(databaseName = 'BokkenLocalDB') {
    super(databaseName);
    this.version(1).stores({
      session: 'key, userId'
    });
    this.version(2).stores({
      session: 'key, userId',
      foci: '&[userId+id], userId, id, updatedAt, deletedAt, [userId+updatedAt]',
      subjects: '&[userId+id], userId, id, focusId, updatedAt, deletedAt, [userId+focusId], [userId+updatedAt]',
      questions: '&[userId+id], userId, id, subjectId, type, updatedAt, deletedAt, [userId+subjectId], [userId+updatedAt]',
      quizSessions: '&[userId+id], userId, id, state, startedAt, [userId+state]',
      quizSessionQuestions: '&[userId+id], userId, id, sessionId, questionId, position, status, [userId+sessionId], [userId+sessionId+position]',
      syncCursors: '&[userId+scope], userId, scope, updatedAt',
      outbox: '&[userId+id], userId, id, idempotencyKey, status, createdAt, updatedAt, [userId+idempotencyKey], [userId+status+createdAt], [userId+status+updatedAt], [userId+sessionId+createdAt]'
    });
  }
}

export const db = new BokkenDatabase();
