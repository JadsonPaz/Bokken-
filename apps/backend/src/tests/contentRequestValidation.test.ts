import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Request, Response } from 'express';
import { FocusController } from '../controllers/focusController.js';
import { SubjectController } from '../controllers/subjectController.js';
import { QuestionController } from '../controllers/questionController.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { AppError } from '../utils/errors.js';

async function invokeController(handler: Function, input: { params?: unknown; query?: unknown }) {
  let statusCode: number | undefined;
  let responseBody: unknown;
  const req = {
    ...input,
    user: { id: crypto.randomUUID(), email: 'test@example.invalid' }
  } as unknown as Request;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(body: unknown) { responseBody = body; return this; }
  } as unknown as Response;

  await handler(req, res, (error: Error) => errorHandler(error, req, res, () => undefined));
  return { statusCode, responseBody };
}

describe('Validação de parâmetros das rotas de conteúdo', () => {
  it('retorna 400 para UUID inválido em parâmetros e consultas', async () => {
    const focusController = new FocusController({} as never);
    const subjectController = new SubjectController({} as never);
    const questionController = new QuestionController({} as never);

    assert.strictEqual((await invokeController(focusController.getById, { params: { id: 'malformed' } })).statusCode, 400);
    assert.strictEqual((await invokeController(subjectController.list, { query: { focusId: 'malformed' } })).statusCode, 400);
    assert.strictEqual((await invokeController(questionController.list, { query: { subjectId: 'malformed' } })).statusCode, 400);
    assert.strictEqual((await invokeController(questionController.getById, { params: { id: 'malformed' } })).statusCode, 400);
  });

  it('retorna 400 para paginação ausente de formato válido, zero, negativa, fracionária ou acima do limite', async () => {
    const controller = new QuestionController({} as never);
    const subjectId = crypto.randomUUID();

    for (const page of ['abc', 'NaN', '0', '-1', '1.5', '1000001']) {
      const result = await invokeController(controller.list, { query: { subjectId, page } });
      assert.strictEqual(result.statusCode, 400, `page=${page} deveria retornar 400`);
    }
    for (const limit of ['abc', '0', '-1', '1.5', '101']) {
      const result = await invokeController(controller.list, { query: { subjectId, limit } });
      assert.strictEqual(result.statusCode, 400, `limit=${limit} deveria retornar 400`);
    }
  });

  it('aceita limites válidos e mantém 404 para recurso válido inexistente', async () => {
    let receivedPage = 0;
    let receivedLimit = 0;
    const questionService = {
      async listQuestions(_subjectId: string, _userId: string, params: { page: number; limit: number }) {
        receivedPage = params.page;
        receivedLimit = params.limit;
        return { items: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
      },
      async getQuestion() { throw new AppError('Pergunta não encontrada', 404); }
    };
    const controller = new QuestionController(questionService as never);
    const listed = await invokeController(controller.list, {
      query: { subjectId: crypto.randomUUID(), page: '1', limit: '100' }
    });
    const missing = await invokeController(controller.getById, { params: { id: crypto.randomUUID() } });

    assert.strictEqual(listed.statusCode, 200);
    assert.strictEqual(receivedPage, 1);
    assert.strictEqual(receivedLimit, 100);
    assert.strictEqual(missing.statusCode, 404);
  });
});
