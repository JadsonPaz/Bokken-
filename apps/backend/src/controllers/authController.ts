import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';
import { AppError } from '../utils/errors.js';

export class AuthController {
  constructor(private authService: AuthService = new AuthService()) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new AppError('Usuário não autenticado', 401);
      }

      // Regra de segurança: obtém o ID estritamente do token validado
      const user = await this.authService.getMe(req.user.id);
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  };
}
