import { Request, Response, NextFunction } from 'express';
import { QuestionService } from '../services/questionService.js';
import { AppError } from '../utils/errors.js';
import { parseContentUuid, parseQuestionListQuery } from '../utils/contentRequestValidation.js';

export class QuestionController {
  constructor(private questionService: QuestionService = new QuestionService()) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const { subjectId, search, page, limit } = parseQuestionListQuery(req.query);

      const result = await this.questionService.listQuestions(subjectId, req.user.id, {
        search,
        page,
        limit
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const question = await this.questionService.getQuestion(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ question });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const question = await this.questionService.createQuestion(req.user.id, req.body);
      res.status(201).json({ question });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const question = await this.questionService.updateQuestion(parseContentUuid(req.params.id), req.user.id, req.body);
      res.status(200).json({ question });
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      await this.questionService.deleteQuestion(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ message: 'Pergunta excluída com sucesso' });
    } catch (err) {
      next(err);
    }
  };
}
