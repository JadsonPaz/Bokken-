import { Request, Response, NextFunction } from 'express';
import { FocusService } from '../services/focusService.js';
import { AppError } from '../utils/errors.js';
import { parseContentUuid } from '../utils/contentRequestValidation.js';

export class FocusController {
  constructor(private focusService: FocusService = new FocusService()) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const foci = await this.focusService.listFoci(req.user.id);
      res.status(200).json({ foci });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const focus = await this.focusService.getFocus(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ focus });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const focus = await this.focusService.createFocus(req.user.id, req.body);
      res.status(201).json({ focus });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const focus = await this.focusService.updateFocus(parseContentUuid(req.params.id), req.user.id, req.body);
      res.status(200).json({ focus });
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      await this.focusService.deleteFocus(parseContentUuid(req.params.id), req.user.id);
      res.status(200).json({ message: 'Foco e matérias excluídos com sucesso' });
    } catch (err) {
      next(err);
    }
  };
}
