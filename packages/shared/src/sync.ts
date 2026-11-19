import { z } from 'zod';
import { QuestionType } from './types/index.js';

const isoDateTime = z.string().datetime();
const sequence = z.string().regex(/^(0|[1-9]\d{0,39})$/, 'Sequência de sincronização inválida.');

export const syncedFocusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}).strict();

export const syncedSubjectSchema = z.object({
  id: z.string().uuid(),
  focusId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}).strict();

/** Deliberately excludes correctness, explanations and expected answers. */
export const syncedQuestionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  type: z.nativeEnum(QuestionType),
  statement: z.string(),
  options: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
    orderIndex: z.number().int().nonnegative()
  }).strict()),
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}).strict();

const tombstoneFields = {
  sequence,
  id: z.string().uuid(),
  deletedAt: isoDateTime
};

export const contentSyncChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FOCUS_UPSERT'), sequence, focus: syncedFocusSchema }).strict(),
  z.object({ kind: z.literal('SUBJECT_UPSERT'), sequence, subject: syncedSubjectSchema }).strict(),
  z.object({ kind: z.literal('QUESTION_UPSERT'), sequence, question: syncedQuestionSchema }).strict(),
  z.object({ kind: z.literal('FOCUS_TOMBSTONE'), ...tombstoneFields }).strict(),
  z.object({ kind: z.literal('SUBJECT_TOMBSTONE'), ...tombstoneFields, focusId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('QUESTION_TOMBSTONE'), ...tombstoneFields, subjectId: z.string().uuid() }).strict()
]);

export const contentSyncPageSchema = z.object({
  changes: z.array(contentSyncChangeSchema).max(200),
  nextCursor: z.string().min(1).max(2048),
  hasMore: z.boolean()
}).strict();

export type SyncedFocus = z.infer<typeof syncedFocusSchema>;
export type SyncedSubject = z.infer<typeof syncedSubjectSchema>;
export type SyncedQuestion = z.infer<typeof syncedQuestionSchema>;
export type ContentSyncChange = z.infer<typeof contentSyncChangeSchema>;
export type ContentSyncPage = z.infer<typeof contentSyncPageSchema>;
