import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { CONTENT_SYNC_DEFAULT_LIMIT, ContentSyncService } from '../services/contentSyncService.js';

const querySchema = z.object({
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional()
}).strict();

export class ContentSyncController {
  constructor(private readonly service: ContentSyncService = new ContentSyncService()) {}

  pull = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw new AppError('Não autenticado', 401);
      const query = querySchema.parse(req.query);
      const limit = query.limit === undefined ? CONTENT_SYNC_DEFAULT_LIMIT : Number(query.limit);
      const page = await this.service.pull(req.user.id, query.cursor, limit);
      res.status(200).json(page);
    } catch (error) {
      next(error);
    }
  };
}
