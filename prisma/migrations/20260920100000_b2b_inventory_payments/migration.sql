CREATE TABLE "B2bPayment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reference" TEXT,
  "collectedById" TEXT,
  "collectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2bPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "B2bPayment_orderId_key" ON "B2bPayment"("orderId");
CREATE INDEX "B2bPayment_status_createdAt_idx" ON "B2bPayment"("status", "createdAt");
CREATE INDEX "B2bPayment_collectedById_createdAt_idx" ON "B2bPayment"("collectedById", "createdAt");

ALTER TABLE "B2bPayment"
  ADD CONSTRAINT "B2bPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2bOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bPayment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
