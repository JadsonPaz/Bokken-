import { Router, Request, Response } from 'express';
import { APP_NAME, APP_VERSION } from '@bokken/shared';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    name: APP_NAME,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});
