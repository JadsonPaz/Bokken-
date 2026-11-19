import { randomInt } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { DiscursiveAssessment, QuizAttemptFeedback, QuizMode, QuizQuestionStatus, QuizSessionDetail, QuizSkipResult, QuestionSnapshot, QuestionType, createQuizSessionSchema, questionSnapshotSchema, submitQuizAnswerSchema } from '@bokken/shared';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';

type Input = ReturnType<typeof createQuizSessionSchema.parse>;
type AnswerInput = ReturnType<typeof submitQuizAnswerSchema.parse>;
type DbClient = PrismaClient | Prisma.TransactionClient;

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

function snapshotOf(q: any): QuestionSnapshot {
  return questionSnapshotSchema.parse({ type: q.type, statement: q.statement, explanation: q.explanation, expectedAnswer: q.expectedAnswer, options: q.options.map((o: any) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, orderIndex: o.orderIndex })) });
}

function studyDateAt(date: Date, timezone: string): string {
  const values = new Map(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function projectSnapshot(snapshot: QuestionSnapshot, revealAnswers: boolean): QuestionSnapshot | Omit<QuestionSnapshot, 'options'> & { options: Array<{ id: string; text: string; orderIndex: number; isCorrect?: boolean }> } {
  if (revealAnswers) return snapshot;
  return { ...snapshot, explanation: null, expectedAnswer: null, options: snapshot.options.map(({ id, text, orderIndex }) => ({ id, text, orderIndex })) };
}

export function projectAttemptFeedback(attempt: any): QuizAttemptFeedback {
  return {
    id: attempt.id,
    questionId: attempt.questionId,
    isCorrect: attempt.isCorrect,
    selectedOptionId: attempt.selectedOptionId,
    selectedOptionTextSnapshot: attempt.selectedOptionTextSnapshot,
    discursiveAssessment: attempt.discursiveAssessment,
    timeSpentSeconds: attempt.timeSpentSeconds,
    clientCreatedAt: attempt.clientCreatedAt.toISOString()
  };
}

export function projectSkippedQuestion(entry: { id: string; position: number }, skippedAt: Date): QuizSkipResult {
  return { id: entry.id, position: entry.position, status: QuizQuestionStatus.SKIPPED, skippedAt: skippedAt.toISOString() };
}

export function projectQuizSession(session: any, attempts: any[]): QuizSessionDetail {
  const byQuestion = new Map(attempts.map(attempt => [attempt.questionId, attempt]));
  return {
    id: session.id, userId: session.userId, mode: session.mode as any,
    totalQuestions: session.totalQuestions, totalCorrect: session.totalCorrect, totalIncorrect: session.totalIncorrect,
    durationSeconds: session.durationSeconds, startedAt: session.startedAt.toISOString(), finishedAt: session.finishedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString(),
    questions: session.questions.map((entry: any) => {
      const snapshot = questionSnapshotSchema.parse(entry.snapshot);
      const attempt = byQuestion.get(entry.questionId);
      const reveal = !!session.finishedAt || entry.status === QuizQuestionStatus.ANSWERED;
      return {
        id: entry.id, sessionId: entry.sessionId, questionId: entry.questionId, snapshotVersion: entry.snapshotVersion,
        snapshot: projectSnapshot(snapshot, reveal) as any, position: entry.position, status: entry.status as any,
        answeredAt: entry.answeredAt?.toISOString() ?? null, skippedAt: entry.skippedAt?.toISOString() ?? null,
        attempt: attempt ? projectAttemptFeedback(attempt) : null
      };
    })
  };
}

function sameOperation(attempt: any, input: AnswerInput, sessionId: string, questionId: string): boolean {
  if (attempt.quizSessionId !== sessionId || attempt.questionId !== questionId || attempt.timeSpentSeconds !== input.timeSpentSeconds) return false;
  if (input.type === QuestionType.MULTIPLE_CHOICE) {
    return attempt.selectedOptionId === input.selectedOptionId && attempt.discursiveAssessment === null;
  }
  return attempt.selectedOptionId === null && attempt.discursiveAssessment === input.assessment;
}

function responseFor(attempt: any, snapshot: QuestionSnapshot, alreadyRecorded: boolean) {
  return { attempt: projectAttemptFeedback(attempt), snapshot, alreadyRecorded };
}

export class QuizService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createSession(userId: string, raw: unknown): Promise<QuizSessionDetail> {
    const input: Input = createQuizSessionSchema.parse(raw);
    let focusIds: string[] | undefined;
    let subjectId: string | undefined;
    if (input.mode === QuizMode.FOCUS) focusIds = [input.focusId!];
    if (input.mode === QuizMode.GENERAL_CUSTOM) focusIds = input.focusIds;
    if (input.mode === QuizMode.SUBJECT) subjectId = input.subjectId;

    const ownedFoci = focusIds ? await this.db.focus.findMany({ where: { id: { in: focusIds }, userId, deletedAt: null }, select: { id: true } }) : undefined;
    if (ownedFoci && ownedFoci.length !== focusIds!.length) throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    if (subjectId) {
      const ownedSubject = await this.db.subject.findFirst({ where: { id: subjectId, deletedAt: null, focus: { userId, deletedAt: null } }, select: { id: true } });
      if (!ownedSubject) throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }
    const candidates = await this.db.question.findMany({
      where: { deletedAt: null, type: { in: input.types }, ...(subjectId ? { subjectId } : {}), subject: { deletedAt: null, focus: { userId, deletedAt: null, ...(focusIds ? { id: { in: focusIds } } : {}) } } },
      include: { options: { where: { retiredAt: null }, orderBy: { orderIndex: 'asc' } } }
    });
    const chosen = shuffle(candidates).slice(0, input.limit ?? candidates.length);
    if (!chosen.length) throw new AppError('Não há perguntas disponíveis para os filtros selecionados.', 400);

    return this.db.$transaction(async tx => {
      const session = await tx.quizSession.create({ data: { userId, mode: input.mode, totalQuestions: chosen.length } });
      await tx.quizSessionQuestion.createMany({ data: chosen.map((q, position) => ({ sessionId: session.id, questionId: q.id, snapshot: snapshotOf(q) as any, position })) });
      return this.getSession(userId, session.id, tx);
    });
  }

  async getSession(userId: string, sessionId: string, client: DbClient = this.db): Promise<QuizSessionDetail> {
    const session = await client.quizSession.findFirst({ where: { id: sessionId, userId }, include: { questions: { orderBy: { position: 'asc' } } } });
    if (!session) throw new AppError('Sessão não encontrada ou não pertence ao usuário', 404);
    const attempts = await client.questionAttempt.findMany({
      where: { quizSessionId: sessionId, userId },
      select: { id: true, questionId: true, isCorrect: true, selectedOptionId: true, selectedOptionTextSnapshot: true, discursiveAssessment: true, timeSpentSeconds: true, clientCreatedAt: true }
    });
    return projectQuizSession(session, attempts);
  }

  async answer(userId: string, sessionId: string, sessionQuestionId: string, raw: unknown) {
    const input: AnswerInput = submitQuizAnswerSchema.parse(raw);
    const perform = async (tx: Prisma.TransactionClient) => {
      const entry = await tx.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, session: { userId } } });
      if (!entry) throw new AppError('Pergunta da sessão não encontrada ou não pertence ao usuário', 404);
      const snapshot = questionSnapshotSchema.parse(entry.snapshot);

      const existing = await tx.questionAttempt.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } });
      if (existing) {
        if (!sameOperation(existing, input, sessionId, entry.questionId)) throw new AppError('Chave de idempotência reutilizada com uma operação diferente', 409);
        return responseFor(existing, snapshot, true);
      }
      if (entry.status !== QuizQuestionStatus.PENDING) throw new AppError('Esta pergunta já foi respondida ou pulada', 409);

      const evaluated = evaluateAnswer(snapshot, input);
      const now = new Date();
      const transition = await tx.quizSessionQuestion.updateMany({
        where: { id: entry.id, sessionId, status: QuizQuestionStatus.PENDING, session: { userId, finishedAt: null } },
        data: { status: QuizQuestionStatus.ANSWERED, answeredAt: now }
      });
      if (transition.count !== 1) {
        const replay = await tx.questionAttempt.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } });
        if (replay && sameOperation(replay, input, sessionId, entry.questionId)) return responseFor(replay, snapshot, true);
        throw new AppError('A pergunta mudou de estado durante o envio; atualize a sessão e tente novamente.', 409);
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new AppError('Usuário não encontrado', 404);
      const attempt = await tx.questionAttempt.create({ data: {
        userId, questionId: entry.questionId, quizSessionId: sessionId, idempotencyKey: input.idempotencyKey,
        ...evaluated, timeSpentSeconds: input.timeSpentSeconds, clientStudyDate: studyDateAt(now, user.timezone),
        clientTimezone: user.timezone, clientCreatedAt: now,
        questionSnapshot: snapshot as any, statementSnapshot: snapshot.statement, expectedAnswerSnapshot: snapshot.expectedAnswer ?? null
      } });
      return responseFor(attempt, snapshot, false);
    };

    try {
      return await this.db.$transaction(perform);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        const [attempt, entry] = await Promise.all([
          this.db.questionAttempt.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } }),
          this.db.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, session: { userId } } })
        ]);
        if (attempt && entry && sameOperation(attempt, input, sessionId, entry.questionId)) {
          return responseFor(attempt, questionSnapshotSchema.parse(entry.snapshot), true);
        }
        throw new AppError('Chave de idempotência já utilizada ou operação concorrente conflitante.', 409);
      }
      throw error;
    }
  }

  async skip(userId: string, sessionId: string, sessionQuestionId: string) {
    const entry = await this.db.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, session: { userId } } });
    if (!entry) throw new AppError('Pergunta da sessão não encontrada ou não pertence ao usuário', 404);
    if (entry.status !== QuizQuestionStatus.PENDING) throw new AppError('Esta pergunta já foi respondida ou pulada', 409);
    const skippedAt = new Date();
    const transition = await this.db.quizSessionQuestion.updateMany({
      where: { id: entry.id, sessionId, status: QuizQuestionStatus.PENDING, session: { userId, finishedAt: null } },
      data: { status: QuizQuestionStatus.SKIPPED, skippedAt }
    });
    if (transition.count !== 1) throw new AppError('A pergunta mudou de estado ou a sessão foi finalizada.', 409);
    return projectSkippedQuestion(entry, skippedAt);
  }

  async revealDiscursiveAnswer(userId: string, sessionId: string, sessionQuestionId: string) {
    const entry = await this.db.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, status: QuizQuestionStatus.PENDING, session: { userId, finishedAt: null } } });
    if (!entry) throw new AppError('Pergunta pendente não encontrada ou sessão encerrada', 404);
    const snapshot = questionSnapshotSchema.parse(entry.snapshot);
    if (snapshot.type !== QuestionType.DISCURSIVE) throw new AppError('A revelação manual aplica-se somente a perguntas discursivas', 400);
    return { questionId: entry.id, expectedAnswer: snapshot.expectedAnswer, explanation: snapshot.explanation ?? null };
  }

  async complete(userId: string, sessionId: string): Promise<QuizSessionDetail> {
    return this.db.$transaction(async tx => {
      const session = await tx.quizSession.findFirst({ where: { id: sessionId, userId } });
      if (!session) throw new AppError('Sessão não encontrada ou não pertence ao usuário', 404);
      if (session.finishedAt) return this.getSession(userId, sessionId, tx);

      const pendingCount = await tx.quizSessionQuestion.count({ where: { sessionId, status: QuizQuestionStatus.PENDING } });
      if (pendingCount > 0) throw new AppError('Responda ou pule todas as perguntas antes de concluir o quiz.', 409, { pendingCount });

      const attempts = await tx.questionAttempt.findMany({ where: { quizSessionId: sessionId, userId }, select: { isCorrect: true } });
      const finishedAt = new Date();
      const transition = await tx.quizSession.updateMany({
        where: { id: sessionId, userId, finishedAt: null, questions: { none: { status: QuizQuestionStatus.PENDING } } },
        data: {
          totalCorrect: attempts.filter(a => a.isCorrect).length,
          totalIncorrect: attempts.filter(a => !a.isCorrect).length,
          durationSeconds: Math.max(0, Math.floor((finishedAt.getTime() - session.startedAt.getTime()) / 1000)), finishedAt
        }
      });
      if (transition.count !== 1) {
        const latest = await tx.quizSession.findFirst({ where: { id: sessionId, userId } });
        if (latest?.finishedAt) return this.getSession(userId, sessionId, tx);
        const stillPending = await tx.quizSessionQuestion.count({ where: { sessionId, status: QuizQuestionStatus.PENDING } });
        throw new AppError('A sessão mudou durante a conclusão. Atualize e tente novamente.', 409, { pendingCount: stillPending });
      }
      return this.getSession(userId, sessionId, tx);
    });
  }
}

export function evaluateAnswer(snapshot: QuestionSnapshot, input: AnswerInput) {
  if (snapshot.type !== input.type) throw new AppError('Resposta incompatível com o tipo da pergunta', 400);
  if (input.type === QuestionType.MULTIPLE_CHOICE) {
    const option = snapshot.options.find(o => o.id === input.selectedOptionId);
    if (!option) throw new AppError('Alternativa não pertence ao snapshot desta pergunta', 400);
    return { isCorrect: option.isCorrect, selectedOptionId: option.id, selectedOptionTextSnapshot: option.text, discursiveAssessment: null as DiscursiveAssessment | null };
  }
  return { isCorrect: input.assessment === DiscursiveAssessment.CORRECT, selectedOptionId: null, selectedOptionTextSnapshot: null, discursiveAssessment: input.assessment };
}
