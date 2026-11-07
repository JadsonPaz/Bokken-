import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { QuizController } from '../controllers/quizController.js';

export function createQuizRouter(controller = new QuizController()): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/sessions', controller.create);
  router.get('/sessions/:id', controller.get);
  router.post('/sessions/:id/questions/:questionId/answer', controller.answer);
  router.post('/sessions/:id/questions/:questionId/reveal', controller.reveal);
  router.post('/sessions/:id/questions/:questionId/skip', controller.skip);
  router.post('/sessions/:id/complete', controller.complete);
  return router;
}
export const quizRouter = createQuizRouter();
