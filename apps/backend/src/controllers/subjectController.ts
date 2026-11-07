import { Request, Response, NextFunction } from 'express';
import { SubjectService } from '../services/subjectService.js';
import { AppError } from '../utils/errors.js';
import { parseContentUuid, parseSubjectListQuery } from '../utils/contentRequestValidation.js';

export class SubjectController {
  constructor(private subjectService: SubjectService = new SubjectService()) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const { focusId } = parseSubjectListQuery(req.query);
      const subjects = await this.subjectService.listSubjects(focusId, req.user.id);
      res.status(200).json({ subjects });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const subject = await this.subjectService.getSubject(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ subject });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const subject = await this.subjectService.createSubject(req.user.id, req.body);
      res.status(201).json({ subject });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const subject = await this.subjectService.updateSubject(parseContentUuid(req.params.id), req.user.id, req.body);
      res.status(200).json({ subject });
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      await this.subjectService.deleteSubject(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ message: 'Matéria e perguntas excluídas com sucesso' });
    } catch (err) {
      next(err);
    }
  };
}
