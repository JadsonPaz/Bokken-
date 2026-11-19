-- Additive content change feed. Existing content is represented by one current-state
-- event per row so users with data predating this feature can perform an initial pull.
CREATE TYPE "ContentSyncEntityType" AS ENUM ('FOCUS', 'SUBJECT', 'QUESTION');
CREATE TYPE "ContentSyncOperation" AS ENUM ('UPSERT', 'TOMBSTONE');

CREATE TABLE "content_sync_states" (
  "userId" UUID NOT NULL,
  "lastSequence" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_sync_states_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "content_sync_changes" (
  "userId" UUID NOT NULL,
  "sequence" BIGINT NOT NULL,
  "entityType" "ContentSyncEntityType" NOT NULL,
  "operation" "ContentSyncOperation" NOT NULL,
  "entityId" UUID NOT NULL,
  "parentId" UUID,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_sync_changes_pkey" PRIMARY KEY ("userId", "sequence")
);

CREATE INDEX "content_sync_changes_userId_entityType_entityId_idx"
  ON "content_sync_changes"("userId", "entityType", "entityId");

ALTER TABLE "content_sync_states"
  ADD CONSTRAINT "content_sync_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_sync_changes"
  ADD CONSTRAINT "content_sync_changes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill only into the new feed. No existing content, quiz or attempt rows are changed.
WITH current_content AS (
  SELECT
    f."userId",
    'FOCUS'::"ContentSyncEntityType" AS "entityType",
    CASE WHEN f."deletedAt" IS NULL THEN 'UPSERT'::"ContentSyncOperation" ELSE 'TOMBSTONE'::"ContentSyncOperation" END AS operation,
    f.id AS "entityId",
    NULL::UUID AS "parentId",
    CASE WHEN f."deletedAt" IS NULL THEN jsonb_build_object(
      'focus', jsonb_build_object(
        'id', f.id::text,
        'name', f.name,
        'description', f.description,
        'color', f.color,
        'createdAt', to_char(f."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(f."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ) ELSE jsonb_build_object('deletedAt', to_char(f."deletedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END AS payload,
    COALESCE(f."deletedAt", f."updatedAt") AS changed_at
  FROM "foci" f

  UNION ALL

  SELECT
    f."userId",
    'SUBJECT'::"ContentSyncEntityType",
    CASE WHEN s."deletedAt" IS NULL THEN 'UPSERT'::"ContentSyncOperation" ELSE 'TOMBSTONE'::"ContentSyncOperation" END,
    s.id,
    s."focusId",
    CASE WHEN s."deletedAt" IS NULL THEN jsonb_build_object(
      'subject', jsonb_build_object(
        'id', s.id::text,
        'focusId', s."focusId"::text,
        'name', s.name,
        'description', s.description,
        'createdAt', to_char(s."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(s."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ) ELSE jsonb_build_object('deletedAt', to_char(s."deletedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END,
    COALESCE(s."deletedAt", s."updatedAt")
  FROM "subjects" s
  JOIN "foci" f ON f.id = s."focusId"

  UNION ALL

  SELECT
    f."userId",
    'QUESTION'::"ContentSyncEntityType",
    CASE WHEN q."deletedAt" IS NULL THEN 'UPSERT'::"ContentSyncOperation" ELSE 'TOMBSTONE'::"ContentSyncOperation" END,
    q.id,
    q."subjectId",
    CASE WHEN q."deletedAt" IS NULL THEN jsonb_build_object(
      'question', jsonb_build_object(
        'id', q.id::text,
        'subjectId', q."subjectId"::text,
        'type', q.type::text,
        'statement', q.statement,
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', o.id::text,
            'text', o.text,
            'orderIndex', o."orderIndex"
          ) ORDER BY o."orderIndex", o.id)
          FROM "question_options" o
          WHERE o."questionId" = q.id AND o."retiredAt" IS NULL
        ), '[]'::jsonb),
        'createdAt', to_char(q."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(q."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ) ELSE jsonb_build_object('deletedAt', to_char(q."deletedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END,
    COALESCE(q."deletedAt", q."updatedAt")
  FROM "questions" q
  JOIN "subjects" s ON s.id = q."subjectId"
  JOIN "foci" f ON f.id = s."focusId"
), sequenced AS (
  SELECT
    "userId", "entityType", operation, "entityId", "parentId", payload,
    row_number() OVER (
      PARTITION BY "userId"
      ORDER BY
        CASE WHEN operation = 'TOMBSTONE' THEN 0 ELSE 1 END,
        CASE
          WHEN operation = 'TOMBSTONE' AND "entityType" = 'QUESTION' THEN 1
          WHEN operation = 'TOMBSTONE' AND "entityType" = 'SUBJECT' THEN 2
          WHEN operation = 'TOMBSTONE' AND "entityType" = 'FOCUS' THEN 3
          WHEN "entityType" = 'FOCUS' THEN 1
          WHEN "entityType" = 'SUBJECT' THEN 2
          ELSE 3
        END,
        changed_at,
        "entityId"
    ) AS sequence
  FROM current_content
)
INSERT INTO "content_sync_changes" ("userId", sequence, "entityType", operation, "entityId", "parentId", payload)
SELECT "userId", sequence, "entityType", operation, "entityId", "parentId", payload
FROM sequenced;

INSERT INTO "content_sync_states" ("userId", "lastSequence", "updatedAt")
SELECT "userId", MAX(sequence), CURRENT_TIMESTAMP
FROM "content_sync_changes"
GROUP BY "userId";
