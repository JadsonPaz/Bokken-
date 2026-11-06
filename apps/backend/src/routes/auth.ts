import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/auth.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';

export function createAuthRouter(controller: AuthController = new AuthController()): Router {
  const router = Router();

  router.post('/register', authRateLimiter, controller.register);
  router.post('/login', authRateLimiter, controller.login);
  router.get('/me', authMiddleware, controller.getMe);

  return router;
}

export const authRouter = createAuthRouter();
