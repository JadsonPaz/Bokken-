import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { ContentSyncController } from '../controllers/contentSyncController.js';

export function createSyncRouter(controller: ContentSyncController = new ContentSyncController()): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/content', controller.pull);
  return router;
}

export const syncRouter = createSyncRouter();
