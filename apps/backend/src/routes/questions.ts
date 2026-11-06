import { Router } from 'express';
import { QuestionController } from '../controllers/questionController.js';
import { authMiddleware } from '../middlewares/auth.js';

export function createQuestionRouter(controller: QuestionController = new QuestionController()): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.delete);

  return router;
}

export const questionRouter = createQuestionRouter();
