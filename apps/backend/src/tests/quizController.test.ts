import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Request, Response } from 'express';
import { QuizController } from '../controllers/quizController.js';
import { errorHandler } from '../middlewares/errorHandler.js';

async function call(handler: Function, params: object, userId = crypto.randomUUID()) {
  let status = 200; let body: any;
  const req = { params, body: { userId: crypto.randomUUID() }, user: { id: userId, email: 'u@example.invalid' } } as unknown as Request;
  const res = { status(n: number) { status = n; return this; }, json(value: unknown) { body = value; return this; } } as unknown as Response;
  await handler(req, res, (e: Error) => errorHandler(e, req, res, () => undefined));
  return { status, body };
}

describe('Rotas do quiz', () => {
  it('converte JSON malformado em 400', () => {
    let status = 200;
    const req = {} as Request;
    const res = { status(n: number) { status = n; return this; }, json() { return this; } } as unknown as Response;
    errorHandler(Object.assign(new SyntaxError('invalid json'), { status: 400, type: 'entity.parse.failed' }), req, res, () => undefined);
    assert.equal(status, 400);
  });

  it('rejeita UUIDs malformados como 400 antes de chamar o serviço', async () => {
    let called = false;
    const controller = new QuizController({ getSession: async () => { called = true; return {}; } } as never);
    const result = await call(controller.get, { id: 'nope' });
    assert.equal(result.status, 400); assert.equal(called, false);
  });

  it('deriva userId do JWT para consultar sessão', async () => {
    const authenticatedId = crypto.randomUUID(); let receivedUserId = '';
    const controller = new QuizController({ getSession: async (userId: string) => { receivedUserId = userId; return { id: crypto.randomUUID() }; } } as never);
    const result = await call(controller.get, { id: crypto.randomUUID() }, authenticatedId);
    assert.equal(result.status, 200); assert.equal(receivedUserId, authenticatedId);
  });
});
