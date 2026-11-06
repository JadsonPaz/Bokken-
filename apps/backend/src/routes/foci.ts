import { Router } from 'express';
import { FocusController } from '../controllers/focusController.js';
import { authMiddleware } from '../middlewares/auth.js';

export function createFocusRouter(controller: FocusController = new FocusController()): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.delete);

  return router;
}

export const focusRouter = createFocusRouter();
