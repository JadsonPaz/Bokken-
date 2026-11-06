import { IQuestionRepository, PrismaQuestionRepository, CreateQuestionData, UpdateQuestionData } from '../repositories/questionRepository.js';
import { createQuestionSchema, updateQuestionSchema, Question, QuestionType, PaginatedResponse } from '@bokken/shared';
import { AppError } from '../utils/errors.js';

export class QuestionService {
  constructor(private questionRepository: IQuestionRepository = new PrismaQuestionRepository()) {}

  async listQuestions(
    subjectId: string,
    userId: string,
    params: { search?: string; page?: number; limit?: number }
  ): Promise<PaginatedResponse<Question>> {
    if (!subjectId) {
      throw new AppError('O parâmetro subjectId é obrigatório', 400);
    }
    return this.questionRepository.findAllBySubjectId(subjectId, userId, params);
  }

  async getQuestion(id: string, userId: string): Promise<Question> {
    const question = await this.questionRepository.findById(id, userId);
    if (!question) {
      throw new AppError('Pergunta não encontrada ou não pertence ao usuário', 404);
    }
    return question;
  }

  async createQuestion(userId: string, input: unknown): Promise<Question> {
    const validated = createQuestionSchema.parse(input);

    const data: CreateQuestionData = {
      subjectId: validated.subjectId,
      type: validated.type,
      statement: validated.statement.trim(),
      explanation: validated.explanation?.trim() || null,
      expectedAnswer: validated.type === QuestionType.DISCURSIVE ? validated.expectedAnswer?.trim() || null : null,
      options: validated.type === QuestionType.MULTIPLE_CHOICE && validated.options
        ? validated.options.map((opt, idx) => ({
            text: opt.text.trim(),
            isCorrect: opt.isCorrect,
            orderIndex: opt.orderIndex ?? idx
          }))
        : []
    };

    try {
      return await this.questionRepository.create(data, userId);
    } catch (err: any) {
      throw new AppError(err.message || 'Erro ao criar pergunta', 404);
    }
  }

  async updateQuestion(id: string, userId: string, input: unknown): Promise<Question> {
    const validated = updateQuestionSchema.parse(input);

    // 1. Busca pergunta existente
    const existing = await this.questionRepository.findById(id, userId);
    if (!existing) {
      throw new AppError('Pergunta não encontrada ou não pertence ao usuário', 404);
    }

    // 2. Mescla os dados para validação do estado final
    const finalType = validated.type ?? existing.type;
    const finalStatement = (validated.statement !== undefined ? validated.statement : existing.statement).trim();
    const finalExplanation = validated.explanation !== undefined ? validated.explanation : existing.explanation;
    const finalExpectedAnswer = finalType === QuestionType.DISCURSIVE
      ? (validated.expectedAnswer !== undefined ? validated.expectedAnswer : existing.expectedAnswer)
      : null;

    let finalOptions = existing.options || [];
    if (finalType === QuestionType.DISCURSIVE) {
      finalOptions = [];
    } else if (validated.options !== undefined) {
      finalOptions = (validated.options || []).map((o, idx) => ({
        id: o.id || '',
        questionId: id,
        text: o.text.trim(),
        isCorrect: o.isCorrect,
        orderIndex: o.orderIndex ?? idx,
        createdAt: '',
        updatedAt: ''
      }));
    }

    // Valida estado final conforme as regras de negócio
    if (finalType === QuestionType.MULTIPLE_CHOICE) {
      if (!finalOptions || finalOptions.length < 2) {
        throw new AppError('Perguntas de múltipla escolha devem ter no mínimo duas alternativas.', 400);
      }
      const correctCount = finalOptions.filter(o => o.isCorrect).length;
      if (correctCount !== 1) {
        throw new AppError('Perguntas de múltipla escolha devem ter exatamente uma alternativa correta.', 400);
      }
    }

    if (finalType === QuestionType.DISCURSIVE) {
      if (!finalExpectedAnswer || finalExpectedAnswer.trim().length === 0) {
        throw new AppError('Perguntas discursivas exigem uma resposta esperada obrigatória.', 400);
      }
    }

    const data: UpdateQuestionData = {
      type: finalType,
      statement: finalStatement,
      explanation: finalExplanation ? finalExplanation.trim() : null,
      expectedAnswer: finalExpectedAnswer ? finalExpectedAnswer.trim() : null,
      options: finalType === QuestionType.MULTIPLE_CHOICE && validated.options !== undefined
        ? validated.options.map((opt, idx) => ({
            text: opt.text.trim(),
            isCorrect: opt.isCorrect,
            orderIndex: opt.orderIndex ?? idx
          }))
        : undefined
    };

    const updated = await this.questionRepository.update(id, userId, data);
    if (!updated) {
      throw new AppError('Pergunta não encontrada ou não pertence ao usuário', 404);
    }

    return updated;
  }

  async deleteQuestion(id: string, userId: string): Promise<void> {
    const deleted = await this.questionRepository.softDelete(id, userId);
    if (!deleted) {
      throw new AppError('Pergunta não encontrada ou não pertence ao usuário', 404);
    }
  }
}
