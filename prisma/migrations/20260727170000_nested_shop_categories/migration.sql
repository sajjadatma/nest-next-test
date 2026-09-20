ALTER TABLE "Category"
ADD COLUMN "parentId" TEXT,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "name", "id") - 1 AS position
  FROM "Category"
)
UPDATE "Category"
SET "position" = ranked.position
FROM ranked
WHERE "Category"."id" = ranked."id";

CREATE INDEX "Category_parentId_position_idx" ON "Category"("parentId", "position");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "Category"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
