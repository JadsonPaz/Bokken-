import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'Token de autenticação não fornecido'
    });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({
      error: 'Formato do cabeçalho de autenticação inválido. Utilize "Bearer <token>"'
    });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      error: 'Token inválido ou expirado'
    });
    return;
  }

  req.user = {
    id: payload.userId,
    email: payload.email
  };

  next();
}
