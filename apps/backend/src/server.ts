import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { focusRouter } from './routes/foci.js';
import { subjectRouter } from './routes/subjects.js';
import { questionRouter } from './routes/questions.js';
import { quizRouter } from './routes/quizzes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { APP_NAME } from '@bokken/shared';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  }));

  app.use(express.json());

  // Rotas da API
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);

  // Rotas de Gestão de Conteúdos (Etapa 3)
  app.use('/api/foci', focusRouter);
  app.use('/api/subjects', subjectRouter);
  app.use('/api/questions', questionRouter);
  app.use('/api/quizzes', quizRouter);

  // Middleware de Tratamento Centralizado de Erros
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export const server = app.listen(env.PORT, () => {
  console.log(`🚀 [${APP_NAME}] Backend rodando em http://localhost:${env.PORT}`);
  console.log(`📡 Ambiente: ${env.NODE_ENV}`);
});

export default app;
