CREATE TABLE "SystemLog" (
  "id" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "requestId" TEXT,
  "path" TEXT,
  "statusCode" INTEGER,
  "actorId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");
CREATE INDEX "SystemLog_category_createdAt_idx" ON "SystemLog"("category", "createdAt");
CREATE INDEX "SystemLog_severity_createdAt_idx" ON "SystemLog"("severity", "createdAt");
CREATE INDEX "SystemLog_actorId_createdAt_idx" ON "SystemLog"("actorId", "createdAt");
