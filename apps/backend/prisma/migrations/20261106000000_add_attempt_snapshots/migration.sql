-- AlterTable
ALTER TABLE "question_attempts" ADD COLUMN "statementSnapshot" TEXT,
ADD COLUMN "selectedOptionTextSnapshot" TEXT,
ADD COLUMN "expectedAnswerSnapshot" TEXT;
