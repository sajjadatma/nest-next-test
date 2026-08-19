-- Persisted B2B carts are scoped to one authenticated user, company, and currency.
-- B2C carts remain client-side and are intentionally unaffected.
CREATE TABLE "B2bCart" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2bCart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2bCartLine" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2bCartLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "B2bCart_companyId_userId_currency_key" ON "B2bCart"("companyId", "userId", "currency");
CREATE INDEX "B2bCart_userId_updatedAt_idx" ON "B2bCart"("userId", "updatedAt");
CREATE INDEX "B2bCart_companyId_updatedAt_idx" ON "B2bCart"("companyId", "updatedAt");
CREATE UNIQUE INDEX "B2bCartLine_cartId_variantId_key" ON "B2bCartLine"("cartId", "variantId");
CREATE INDEX "B2bCartLine_variantId_idx" ON "B2bCartLine"("variantId");

ALTER TABLE "B2bCart"
  ADD CONSTRAINT "B2bCart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bCart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "B2bCartLine"
  ADD CONSTRAINT "B2bCartLine_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "B2bCart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "B2bCartLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
