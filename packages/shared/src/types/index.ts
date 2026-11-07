// ==========================================
// ENUMS DE DOMÍNIO
// ==========================================

export enum QuestionType {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  DISCURSIVE = 'DISCURSIVE'
}

export enum DiscursiveAssessment {
  CORRECT = 'CORRECT',
  INCORRECT = 'INCORRECT'
}

export enum QuizMode {
  SUBJECT = 'SUBJECT',
  FOCUS = 'FOCUS',
  GENERAL_ALL = 'GENERAL_ALL',
  GENERAL_CUSTOM = 'GENERAL_CUSTOM'
}

export enum SyncStatus {
  PENDING = 'PENDING',
  IN_FLIGHT = 'IN_FLIGHT',
  FAILED = 'FAILED'
}

// ==========================================
// ENTIDADES PRINCIPAIS
// ==========================================

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export interface AuthResponse {
  user: SafeUser;
  token: string;
}

export interface Focus {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Subject {
  id: string;
  focusId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface QuestionOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionOptionSnapshot {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface QuestionSnapshot {
  type: QuestionType;
  statement: string;
  explanation?: string | null;
  expectedAnswer?: string | null;
  options: QuestionOptionSnapshot[];
}

export interface Question {
  id: string;
  subjectId: string;
  type: QuestionType;
  statement: string;
  explanation?: string | null;
  expectedAnswer?: string | null;
  options?: QuestionOption[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface QuestionSRSProgress {
  id: string;
  userId: string;
  questionId: string;
  repetitions: number;
  consecutiveCorrect: number;
  totalAttempts: number;
  totalCorrect: number;
  totalIncorrect: number;
  priorityScore: number;
  lastAttemptAt?: string | null;
  nextReviewAt?: string | null;
  updatedAt: string;
}

export interface QuizSession {
  id: string;
  userId: string;
  mode: QuizMode;
  totalQuestions: number;
  totalCorrect: number;
  totalIncorrect: number;
  durationSeconds: number;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export enum QuizQuestionStatus { PENDING = 'PENDING', ANSWERED = 'ANSWERED', SKIPPED = 'SKIPPED' }
export type QuizPromptSnapshot = Omit<QuestionSnapshot, 'options'> & { options: Array<Omit<QuestionOptionSnapshot, 'isCorrect'> & { isCorrect?: boolean }> };
export interface QuizSessionQuestion {
  id: string; sessionId: string; questionId: string; snapshot: QuizPromptSnapshot; snapshotVersion: number;
  position: number; status: QuizQuestionStatus; answeredAt?: string | null; skippedAt?: string | null;
  attempt?: QuestionAttempt | null;
}
export interface QuizSessionDetail extends QuizSession {
  questions: QuizSessionQuestion[];
}
export interface CreateQuizSessionInput {
  mode: QuizMode; focusId?: string; subjectId?: string; focusIds?: string[];
  types: QuestionType[]; limit: number | null;
}

export interface FocusWithCount extends Focus {
  subjectsCount: number;
  questionsCount: number;
}

export interface SubjectWithCount extends Subject {
  questionsCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QuestionAttempt {
  id: string;
  userId: string;
  questionId: string;
  quizSessionId?: string | null;
  isCorrect: boolean;
  selectedOptionId?: string | null;
  discursiveAssessment?: DiscursiveAssessment | null;
  timeSpentSeconds: number;
  clientStudyDate: string; // YYYY-MM-DD
  clientTimezone?: string | null;
  statementSnapshot?: string | null;
  selectedOptionTextSnapshot?: string | null;
  expectedAnswerSnapshot?: string | null;
  questionSnapshot: QuestionSnapshot;
  clientCreatedAt: string;
  syncedAt?: string;
}

export interface DailyStudyLog {
  id: string;
  userId: string;
  studyDate: string; // YYYY-MM-DD
  questionsAnswered: number;
  correctCount: number;
  incorrectCount: number;
  updatedAt: string;
}

// ==========================================
// DTOs DE SINCRONIZAÇÃO
// ==========================================

export interface SyncPushPayload {
  sessions: QuizSession[];
  attempts: QuestionAttempt[];
}

export interface SyncPushResponse {
  syncedSessionIds: string[];
  syncedAttemptIds: string[];
  serverTimestamp: string;
}

export interface SyncPullResponse {
  serverTimestamp: string;
  foci: Focus[];
  subjects: Subject[];
  questions: Question[];
}

export interface SyncQueueItem {
  id: string;
  action: 'PUSH_ATTEMPTS' | 'PULL_UPDATES';
  payload: any;
  createdAt: number;
  status: SyncStatus;
  retryCount: number;
  lastError?: string | null;
}
