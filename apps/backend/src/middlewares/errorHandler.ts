import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    const formattedErrors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    res.status(400).json({
      error: 'Dados de entrada inválidos',
      details: formattedErrors
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message
    });
    return;
  }

  console.error('💥 Erro interno não tratado:', error);

  res.status(500).json({
    error: 'Ocorreu um erro interno no servidor. Tente novamente mais tarde.'
  });
}
