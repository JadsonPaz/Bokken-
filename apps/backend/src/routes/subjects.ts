import { Router } from 'express';
import { SubjectController } from '../controllers/subjectController.js';
import { authMiddleware } from '../middlewares/auth.js';

export function createSubjectRouter(controller: SubjectController = new SubjectController()): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.delete);

  return router;
}

export const subjectRouter = createSubjectRouter();
