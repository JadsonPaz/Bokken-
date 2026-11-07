import { randomInt } from 'node:crypto';
import { DiscursiveAssessment, QuestionSnapshot, QuestionType, QuizMode, QuizQuestionStatus, createQuizSessionSchema, questionSnapshotSchema, submitQuizAnswerSchema } from '@bokken/shared';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';

type Input = ReturnType<typeof createQuizSessionSchema.parse>;
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
export function evaluateAnswer(snapshot: QuestionSnapshot, input: ReturnType<typeof submitQuizAnswerSchema.parse>) {
  if (snapshot.type !== input.type) throw new AppError('Resposta incompatível com o tipo da pergunta', 400);
  if (input.type === QuestionType.MULTIPLE_CHOICE) {
    const option = snapshot.options.find(o => o.id === input.selectedOptionId);
    if (!option) throw new AppError('Alternativa não pertence ao snapshot desta pergunta', 400);
    return { isCorrect: option.isCorrect, selectedOptionId: option.id, selectedOptionTextSnapshot: option.text, discursiveAssessment: null as DiscursiveAssessment | null };
  }
  return { isCorrect: input.assessment === DiscursiveAssessment.CORRECT, selectedOptionId: null, selectedOptionTextSnapshot: null, discursiveAssessment: input.assessment };
}

export class QuizService {
  async createSession(userId: string, raw: unknown) {
    const input: Input = createQuizSessionSchema.parse(raw);
    let focusIds: string[] | undefined;
    let subjectId: string | undefined;
    if (input.mode === QuizMode.FOCUS) focusIds = [input.focusId!];
    if (input.mode === QuizMode.GENERAL_CUSTOM) focusIds = input.focusIds;
    if (input.mode === QuizMode.SUBJECT) subjectId = input.subjectId;

    const ownedFoci = focusIds ? await prisma.focus.findMany({ where: { id: { in: focusIds }, userId, deletedAt: null }, select: { id: true } }) : undefined;
    if (ownedFoci && ownedFoci.length !== focusIds!.length) throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    if (subjectId) {
      const ownedSubject = await prisma.subject.findFirst({ where: { id: subjectId, deletedAt: null, focus: { userId, deletedAt: null } }, select: { id: true } });
      if (!ownedSubject) throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }
    const candidates = await prisma.question.findMany({
      where: { deletedAt: null, type: { in: input.types }, ...(subjectId ? { subjectId } : {}), subject: { deletedAt: null, focus: { userId, deletedAt: null, ...(focusIds ? { id: { in: focusIds } } : {}) } } },
      include: { options: { where: { retiredAt: null }, orderBy: { orderIndex: 'asc' } } }
    });
    const chosen = shuffle(candidates).slice(0, input.limit ?? candidates.length);
    if (!chosen.length) throw new AppError('Não há perguntas disponíveis para os filtros selecionados.', 400);

    return prisma.$transaction(async tx => {
      const session = await tx.quizSession.create({ data: { userId, mode: input.mode, totalQuestions: chosen.length } });
      await tx.quizSessionQuestion.createMany({ data: chosen.map((q, position) => ({ sessionId: session.id, questionId: q.id, snapshot: snapshotOf(q) as any, position })) });
      return this.getSession(userId, session.id, tx);
    });
  }

  async getSession(userId: string, sessionId: string, client: any = prisma) {
    const session = await client.quizSession.findFirst({ where: { id: sessionId, userId }, include: { questions: { orderBy: { position: 'asc' } } } });
    if (!session) throw new AppError('Sessão não encontrada ou não pertence ao usuário', 404);
    const attempts = await client.questionAttempt.findMany({ where: { quizSessionId: sessionId, userId } });
    const byQuestion = new Map(attempts.map((a: any) => [a.questionId, a]));
    return { ...session, questions: session.questions.map((q: any) => ({ ...q, snapshot: projectSnapshot(q.snapshot as QuestionSnapshot, q.status === QuizQuestionStatus.ANSWERED), attempt: byQuestion.get(q.questionId) ?? null })) };
  }

  async answer(userId: string, sessionId: string, sessionQuestionId: string, raw: unknown) {
    const input = submitQuizAnswerSchema.parse(raw);
    try { return await prisma.$transaction(async tx => {
      const entry = await tx.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, session: { userId, finishedAt: null } } });
      if (!entry) throw new AppError('Pergunta da sessão não encontrada ou sessão encerrada', 404);
      const snapshot = questionSnapshotSchema.parse(entry.snapshot);
      const existing = await tx.questionAttempt.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } });
      if (existing) {
        if (existing.quizSessionId !== sessionId || existing.questionId !== entry.questionId) throw new AppError('Chave de idempotência já utilizada', 409);
        return { attempt: existing, alreadyRecorded: true };
      }
      if (entry.status !== QuizQuestionStatus.PENDING) throw new AppError('Esta pergunta já foi respondida ou pulada', 409);
      const evaluated = evaluateAnswer(snapshot, input);
      const now = new Date();
      const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new AppError('Usuário não encontrado', 404);
      const attempt = await tx.questionAttempt.create({ data: {
        userId, questionId: entry.questionId, quizSessionId: sessionId, idempotencyKey: input.idempotencyKey,
        ...evaluated,
        timeSpentSeconds: input.timeSpentSeconds, clientStudyDate: studyDateAt(now, user.timezone), clientTimezone: user.timezone, clientCreatedAt: now,
        questionSnapshot: snapshot as any, statementSnapshot: snapshot.statement, expectedAnswerSnapshot: snapshot.expectedAnswer ?? null
      } });
      await tx.quizSessionQuestion.update({ where: { id: entry.id }, data: { status: QuizQuestionStatus.ANSWERED, answeredAt: now } });
      return { attempt, alreadyRecorded: false };
    }); } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        const attempt = await prisma.questionAttempt.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } });
        const entry = await prisma.quizSessionQuestion.findUnique({ where: { id: sessionQuestionId }, select: { questionId: true } });
        if (attempt?.quizSessionId === sessionId && attempt.questionId === entry?.questionId) return { attempt, alreadyRecorded: true };
        throw new AppError('Chave de idempotência já utilizada', 409);
      }
      throw error;
    }
  }

  async skip(userId: string, sessionId: string, sessionQuestionId: string) {
    const entry = await prisma.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, session: { userId, finishedAt: null } } });
    if (!entry) throw new AppError('Pergunta da sessão não encontrada ou sessão encerrada', 404);
    if (entry.status !== QuizQuestionStatus.PENDING) throw new AppError('Esta pergunta já foi respondida ou pulada', 409);
    const updated = await prisma.quizSessionQuestion.updateMany({ where: { id: entry.id, status: QuizQuestionStatus.PENDING }, data: { status: QuizQuestionStatus.SKIPPED, skippedAt: new Date() } });
    if (updated.count !== 1) throw new AppError('Esta pergunta já foi respondida ou pulada', 409);
    return prisma.quizSessionQuestion.findUniqueOrThrow({ where: { id: entry.id } });
  }

  async revealDiscursiveAnswer(userId: string, sessionId: string, sessionQuestionId: string) {
    const entry = await prisma.quizSessionQuestion.findFirst({ where: { id: sessionQuestionId, sessionId, status: QuizQuestionStatus.PENDING, session: { userId, finishedAt: null } } });
    if (!entry) throw new AppError('Pergunta pendente não encontrada ou sessão encerrada', 404);
    const snapshot = questionSnapshotSchema.parse(entry.snapshot);
    if (snapshot.type !== QuestionType.DISCURSIVE) throw new AppError('A revelação manual aplica-se somente a perguntas discursivas', 400);
    return { expectedAnswer: snapshot.expectedAnswer, explanation: snapshot.explanation ?? null };
  }

  async complete(userId: string, sessionId: string) {
    return prisma.$transaction(async tx => {
      const session = await tx.quizSession.findFirst({ where: { id: sessionId, userId } });
      if (!session) throw new AppError('Sessão não encontrada ou não pertence ao usuário', 404);
      if (!session.finishedAt) {
        const now = new Date();
        await tx.quizSessionQuestion.updateMany({ where: { sessionId, status: QuizQuestionStatus.PENDING }, data: { status: QuizQuestionStatus.SKIPPED, skippedAt: now } });
        const attempts = await tx.questionAttempt.findMany({ where: { quizSessionId: sessionId, userId } });
        await tx.quizSession.update({ where: { id: sessionId }, data: { totalCorrect: attempts.filter(a => a.isCorrect).length, totalIncorrect: attempts.filter(a => !a.isCorrect).length, durationSeconds: Math.max(0, Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)), finishedAt: now } });
      }
      return this.getSession(userId, sessionId, tx);
    });
  }
}
