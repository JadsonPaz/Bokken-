import type {
  DiscursiveAssessment,
  QuestionType,
  QuizAttemptFeedback,
  QuizMode,
  QuizQuestionStatus,
  SafeUser
} from '@bokken/shared';

/** Local cache rows always belong to exactly one server account. Dates are ISO JSON strings. */
export interface LocalFocus {
  userId: string;
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  cachedAt: number;
}

export interface LocalSubject {
  userId: string;
  id: string;
  focusId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  cachedAt: number;
}

/** Presentation content only: correctness and expected answers are deliberately not modeled here. */
export interface LocalQuestionOption {
  id: string;
  text: string;
  orderIndex: number;
}

export interface LocalQuestion {
  userId: string;
  id: string;
  subjectId: string;
  type: QuestionType;
  statement: string;
  options: LocalQuestionOption[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  cachedAt: number;
}

export interface LocalQuestionSnapshot {
  type: QuestionType;
  statement: string;
  options: LocalQuestionOption[];
}

export type LocalQuizSessionState = 'ACTIVE' | 'COMPLETED';

export interface LocalQuizSession {
  userId: string;
  id: string;
  mode: QuizMode;
  totalQuestions: number;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  state: LocalQuizSessionState;
  cachedAt: number;
}

export interface LocalQuizSessionQuestion {
  userId: string;
  id: string;
  sessionId: string;
  questionId: string;
  position: number;
  status: QuizQuestionStatus;
  snapshotVersion: number;
  snapshot: LocalQuestionSnapshot;
  answeredAt: string | null;
  skippedAt: string | null;
  /** Only server-produced feedback may populate this field. */
  attempt: QuizAttemptFeedback | null;
  cachedAt: number;
}

export type LocalSyncScope = 'content' | 'sessions';

export interface LocalSyncCursor {
  userId: string;
  scope: LocalSyncScope;
  /** Opaque server cursor; the client must not parse or increment it. */
  cursor: string;
  updatedAt: number;
}

export type LocalOutboxStatus = 'PENDING_SYNC' | 'PROCESSING' | 'SYNCED' | 'CONFLICT';

interface LocalOutboxBase {
  userId: string;
  id: string;
  /** Stable UUID sent to the API as the idempotency key. */
  idempotencyKey: string;
  status: LocalOutboxStatus;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  lastError: string | null;
  syncedAt: number | null;
}

export type LocalAnswerSubmission =
  | { type: QuestionType.MULTIPLE_CHOICE; selectedOptionId: string; timeSpentSeconds: number }
  | { type: QuestionType.DISCURSIVE; assessment: DiscursiveAssessment; timeSpentSeconds: number };

export type LocalOutboxOperation = LocalOutboxBase & (
  | {
      operation: 'ANSWER_QUESTION';
      sessionId: string;
      sessionQuestionId: string;
      answer: LocalAnswerSubmission;
    }
  | {
      operation: 'SKIP_QUESTION';
      sessionId: string;
      sessionQuestionId: string;
    }
  | {
      operation: 'COMPLETE_SESSION';
      sessionId: string;
    }
);

type WithoutLocalOutboxMetadata<T> = T extends LocalOutboxOperation
  ? Omit<T, 'userId' | 'status' | 'createdAt' | 'updatedAt' | 'attemptCount' | 'lastError' | 'syncedAt'>
  : never;
export type NewLocalOutboxOperation = WithoutLocalOutboxMetadata<LocalOutboxOperation>;

export interface ActiveOutboxBatch {
  userId: string;
  /** Token is paired with the active session row and only that user's operations. */
  token: string;
  operations: LocalOutboxOperation[];
}

export interface LocalSession {
  key: 'active_session';
  userId: string;
  token: string;
  user: SafeUser;
  savedAt: number;
}
