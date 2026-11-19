-- Additive migration. Existing migrations use snake_case table names and camelCase columns.
CREATE TYPE "QuizQuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED');

ALTER TABLE "question_attempts" ADD COLUMN "idempotencyKey" UUID;
CREATE UNIQUE INDEX "question_attempts_userId_idempotencyKey_key"
  ON "question_attempts"("userId", "idempotencyKey");

CREATE TABLE "quiz_session_questions" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL,
  "status" "QuizQuestionStatus" NOT NULL DEFAULT 'PENDING',
  "answeredAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_session_questions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quiz_session_questions_sessionId_position_key"
  ON "quiz_session_questions"("sessionId", "position");
CREATE UNIQUE INDEX "quiz_session_questions_sessionId_questionId_key"
  ON "quiz_session_questions"("sessionId", "questionId");
CREATE INDEX "quiz_session_questions_sessionId_status_position_idx"
  ON "quiz_session_questions"("sessionId", "status", "position");
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
