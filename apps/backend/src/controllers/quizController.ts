import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { QuizService } from '../services/quizService.js';
import { AppError } from '../utils/errors.js';

const uuid = z.string().uuid();
export class QuizController {
  constructor(private service = new QuizService()) {}
  create = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); res.status(201).json({ session: await this.service.createSession(req.user.id, req.body) }); } catch (e) { next(e); } };
  get = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); const id = uuid.parse(req.params.id); res.json({ session: await this.service.getSession(req.user.id, id) }); } catch (e) { next(e); } };
  answer = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); const sessionId = uuid.parse(req.params.id); const questionId = uuid.parse(req.params.questionId); res.json(await this.service.answer(req.user.id, sessionId, questionId, req.body)); } catch (e) { next(e); } };
  skip = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); res.json({ question: await this.service.skip(req.user.id, uuid.parse(req.params.id), uuid.parse(req.params.questionId)) }); } catch (e) { next(e); } };
  reveal = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); res.json(await this.service.revealDiscursiveAnswer(req.user.id, uuid.parse(req.params.id), uuid.parse(req.params.questionId))); } catch (e) { next(e); } };
  complete = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.user?.id) throw new AppError('Não autenticado', 401); res.json({ session: await this.service.complete(req.user.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); } };
}
