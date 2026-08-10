CREATE TYPE "DemandOutcome" AS ENUM ('UNKNOWN', 'MATCHED', 'NO_MATCH', 'OUT_OF_STOCK', 'PRICE_TOO_HIGH', 'VARIANT_UNAVAILABLE', 'HANDED_OFF', 'MATCHED_NOT_PURCHASED', 'PURCHASED', 'ABANDONED');

CREATE TABLE "DemandEvent" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "intentKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "channel" TEXT NOT NULL,
  "region" TEXT,
  "category" TEXT,
  "brand" TEXT,
  "canonicalAttributes" JSONB NOT NULL,
  "size" TEXT,
  "budgetMin" INTEGER,
  "budgetMax" INTEGER,
  "currency" TEXT,
  "purchaseIntent" TEXT,
  "confidence" DOUBLE PRECISION,
  "matchedProductId" TEXT,
  "outcome" "DemandOutcome" NOT NULL,
  "failureReason" TEXT,
  "privacyVersion" TEXT NOT NULL,
  CONSTRAINT "DemandEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemandEvent_merchantId_conversationId_intentKey_key" ON "DemandEvent"("merchantId", "conversationId", "intentKey");
CREATE INDEX "DemandEvent_merchantId_occurredAt_idx" ON "DemandEvent"("merchantId", "occurredAt");

ALTER TABLE "DemandEvent" ADD CONSTRAINT "DemandEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandEvent" ADD CONSTRAINT "DemandEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
