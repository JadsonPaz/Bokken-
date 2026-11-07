-- Additive migration: creates server-owned quiz manifests and idempotency support.
CREATE TYPE "QuizQuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED');

ALTER TABLE "question_attempts" ADD COLUMN "idempotency_key" UUID;
CREATE UNIQUE INDEX "question_attempts_user_id_idempotency_key_key"
  ON "question_attempts"("user_id", "idempotency_key");

CREATE TABLE "quiz_session_questions" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_version" INTEGER NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL,
  "status" "QuizQuestionStatus" NOT NULL DEFAULT 'PENDING',
  "answered_at" TIMESTAMP(3),
  "skipped_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_session_questions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quiz_session_questions_session_id_position_key"
  ON "quiz_session_questions"("session_id", "position");
CREATE UNIQUE INDEX "quiz_session_questions_session_id_question_id_key"
  ON "quiz_session_questions"("session_id", "question_id");
CREATE INDEX "quiz_session_questions_session_id_status_position_idx"
  ON "quiz_session_questions"("session_id", "status", "position");
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
