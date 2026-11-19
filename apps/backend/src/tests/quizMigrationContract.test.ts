import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync('prisma/migrations/20261107000000_quiz_sessions_online/migration.sql', 'utf8');
const initialMigration = readFileSync('prisma/migrations/20261105000000_init/migration.sql', 'utf8');

describe('Contrato estático da migração de sessões de quiz', () => {
  it('segue os nomes físicos camelCase de colunas usados pelas migrações existentes', () => {
    assert.match(initialMigration, /"foci"[\s\S]*?"userId"/);
    assert.match(initialMigration, /"question_attempts"[\s\S]*?"quizSessionId"/);
    assert.match(migration, /ALTER TABLE "question_attempts" ADD COLUMN "idempotencyKey" UUID/);
    assert.match(migration, /ON "question_attempts"\("userId", "idempotencyKey"\)/);
    for (const column of ['sessionId', 'questionId', 'snapshot', 'snapshotVersion', 'position', 'status', 'answeredAt', 'skippedAt', 'createdAt', 'updatedAt']) {
      assert.match(migration, new RegExp(`"${column}"`), `migração deve declarar ${column}`);
      assert.match(schema, new RegExp(`\\b${column}\\b`), `schema deve declarar ${column}`);
    }
    assert.doesNotMatch(migration, /"(?:session_id|question_id|snapshot_version|idempotency_key|user_id)"/);
  });

  it('mantém tipos, enums, índices e referências declarados no schema Prisma', () => {
    assert.match(schema, /enum QuizQuestionStatus\s*\{\s*PENDING\s*ANSWERED\s*SKIPPED/s);
    assert.match(schema, /model QuizSessionQuestion[\s\S]*?snapshot\s+Json\s+@db\.JsonB[\s\S]*?snapshotVersion\s+Int\s+@default\(1\)/);
    assert.match(schema, /@@map\("quiz_session_questions"\)/);
    assert.match(migration, /CREATE TYPE "QuizQuestionStatus" AS ENUM \('PENDING', 'ANSWERED', 'SKIPPED'\)/);
    assert.match(migration, /CREATE UNIQUE INDEX "quiz_session_questions_sessionId_position_key"/);
    assert.match(migration, /CREATE UNIQUE INDEX "quiz_session_questions_sessionId_questionId_key"/);
    assert.match(migration, /CREATE INDEX "quiz_session_questions_sessionId_status_position_idx"/);
    assert.match(migration, /REFERENCES "quiz_sessions"\("id"\) ON DELETE CASCADE/);
    assert.match(migration, /REFERENCES "questions"\("id"\) ON DELETE RESTRICT/);
  });
});
