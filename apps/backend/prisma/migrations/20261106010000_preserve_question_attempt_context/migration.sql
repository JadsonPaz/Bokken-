-- Additive migration: retain historical option rows and store complete attempt context.
ALTER TABLE "question_options" ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "question_attempts" ADD COLUMN "questionSnapshot" JSONB;

-- Existing attempts keep their legacy snapshot fields. Historical alternatives cannot
-- be reconstructed reliably from the current question version, so no synthetic backfill
-- is applied to questionSnapshot.
