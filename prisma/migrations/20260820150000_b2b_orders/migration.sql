CREATE TYPE "B2bOrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "B2bOrder" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "B2bOrderStatus" NOT NULL DEFAULT 'PENDING',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING_MANUAL',
  "currency" TEXT NOT NULL,
  "shippingAddress" JSONB NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "shippingMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2bOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2bOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  CONSTRAINT "B2bOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "B2bOrder_number_key" ON "B2bOrder"("number");
CREATE UNIQUE INDEX "B2bOrder_purchaseRequestId_key" ON "B2bOrder"("purchaseRequestId");
CREATE INDEX "B2bOrder_companyId_status_createdAt_idx" ON "B2bOrder"("companyId", "status", "createdAt");
CREATE INDEX "B2bOrder_createdById_createdAt_idx" ON "B2bOrder"("createdById", "createdAt");
CREATE INDEX "B2bOrderLine_orderId_idx" ON "B2bOrderLine"("orderId");
CREATE INDEX "B2bOrderLine_variantId_idx" ON "B2bOrderLine"("variantId");

ALTER TABLE "B2bOrder"
  ADD CONSTRAINT "B2bOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "B2bPurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "B2bOrderLine"
  ADD CONSTRAINT "B2bOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2bOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
