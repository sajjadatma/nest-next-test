CREATE TYPE "B2bPurchaseRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "B2bPurchaseRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "status" "B2bPurchaseRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "currency" TEXT NOT NULL,
  "shippingAddress" JSONB NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "notes" TEXT,
  "rejectionReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2bPurchaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2bPurchaseRequestLine" (
  "id" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "priceSource" TEXT NOT NULL,
  CONSTRAINT "B2bPurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "B2bPurchaseRequest_companyId_status_createdAt_idx" ON "B2bPurchaseRequest"("companyId", "status", "createdAt");
CREATE INDEX "B2bPurchaseRequest_requesterId_createdAt_idx" ON "B2bPurchaseRequest"("requesterId", "createdAt");
CREATE INDEX "B2bPurchaseRequestLine_purchaseRequestId_idx" ON "B2bPurchaseRequestLine"("purchaseRequestId");
CREATE INDEX "B2bPurchaseRequestLine_variantId_idx" ON "B2bPurchaseRequestLine"("variantId");

ALTER TABLE "B2bPurchaseRequest"
  ADD CONSTRAINT "B2bPurchaseRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bPurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bPurchaseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "B2bPurchaseRequestLine"
  ADD CONSTRAINT "B2bPurchaseRequestLine_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "B2bPurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bPurchaseRequestLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
