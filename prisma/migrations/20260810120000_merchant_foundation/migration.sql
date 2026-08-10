CREATE TABLE "Merchant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantMembership" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'operator',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");
CREATE UNIQUE INDEX "MerchantMembership_merchantId_userId_key" ON "MerchantMembership"("merchantId", "userId");
CREATE INDEX "MerchantMembership_userId_idx" ON "MerchantMembership"("userId");

INSERT INTO "Merchant" ("id", "slug", "name", "currency", "isActive", "createdAt", "updatedAt")
VALUES ('cm1v1defaultmerchant0000000', 'default', 'Default Merchant', 'USD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "Product" ADD COLUMN "merchantId" TEXT DEFAULT 'cm1v1defaultmerchant0000000';
UPDATE "Product" AS "product"
SET "merchantId" = "merchant"."id"
FROM "Merchant" AS "merchant"
WHERE "merchant"."slug" = 'default';
ALTER TABLE "Product" ALTER COLUMN "merchantId" SET NOT NULL;

CREATE INDEX "Product_merchantId_isActive_idx" ON "Product"("merchantId", "isActive");

ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
