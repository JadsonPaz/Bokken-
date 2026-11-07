import { z } from 'zod';

const uuidSchema = z.string().uuid('ID inválido; esperado UUID.');

const positiveIntegerQuery = z.union([
  z.string().regex(/^[1-9]\d*$/, 'Informe um inteiro positivo.').transform(Number),
  z.number().int()
]).pipe(z.number().int().min(1).max(1_000_000));

const questionListQuerySchema = z.object({
  subjectId: uuidSchema,
  search: z.string().optional(),
  page: positiveIntegerQuery.default(1),
  limit: z.union([
    z.string().regex(/^[1-9]\d*$/, 'Informe um inteiro positivo.').transform(Number),
    z.number().int()
  ]).pipe(z.number().int().min(1).max(100)).default(10)
});

const subjectListQuerySchema = z.object({ focusId: uuidSchema });

export function parseContentUuid(value: unknown): string {
  return uuidSchema.parse(value);
}

export function parseQuestionListQuery(value: unknown) {
  return questionListQuerySchema.parse(value);
}

export function parseSubjectListQuery(value: unknown) {
  return subjectListQuerySchema.parse(value);
}
