import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipAttempts = new Map<string, RateLimitRecord>();

interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  message?: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxAttempts, message = 'Muitas tentativas. Tente novamente mais tarde.' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = ipAttempts.get(ip);

    if (!record || now > record.resetAt) {
      ipAttempts.set(ip, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    if (record.count >= maxAttempts) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.status(429).json({
        error: message,
        retryAfterSeconds: waitSeconds
      });
      return;
    }

    record.count += 1;
    next();
  };
}

// Limiter para rotas de autenticação (10 tentativas por minuto)
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 10,
  message: 'Limite de tentativas de autenticação excedido. Aguarde 1 minuto.'
});
