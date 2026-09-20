CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
ALTER TABLE "Order"
  ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "confirmationTokenHash" TEXT,
  ADD COLUMN "confirmationEmailStatus" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "confirmationEmailId" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
UPDATE "Order" SET
  "idempotencyKey" = 'legacy-' || "id",
  "confirmationTokenHash" = md5('legacy-' || "id");
ALTER TABLE "Order" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "confirmationTokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE UNIQUE INDEX "Order_confirmationTokenHash_key" ON "Order"("confirmationTokenHash");
