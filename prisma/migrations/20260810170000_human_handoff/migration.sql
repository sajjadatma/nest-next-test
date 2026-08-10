CREATE TYPE "HumanHandoffStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'RESOLVED', 'REJECTED');

CREATE TABLE "HumanHandoff" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "status" "HumanHandoffStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "summary" JSONB NOT NULL,
  CONSTRAINT "HumanHandoff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HumanHandoff_merchantId_status_requestedAt_idx" ON "HumanHandoff"("merchantId", "status", "requestedAt");
CREATE INDEX "HumanHandoff_conversationId_status_idx" ON "HumanHandoff"("conversationId", "status");

ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
