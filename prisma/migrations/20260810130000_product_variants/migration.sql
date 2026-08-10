CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "color" TEXT,
  "size" TEXT,
  "otherAttributes" JSONB,
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "stockQty" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN "defaultVariantId" TEXT;

INSERT INTO "ProductVariant" (
  "id", "productId", "sku", "priceMinor", "currency", "stockQty", "isDefault", "createdAt", "updatedAt"
)
SELECT
  md5('product-default-variant:' || "id"),
  "id",
  'legacy-' || "slug",
  "priceMinor",
  "currency",
  "stockQty",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product";

UPDATE "Product" AS "product"
SET "defaultVariantId" = "variant"."id"
FROM "ProductVariant" AS "variant"
WHERE "variant"."productId" = "product"."id"
  AND "variant"."isDefault" = true;

CREATE UNIQUE INDEX "Product_defaultVariantId_key" ON "Product"("defaultVariantId");
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_productId_isDefault_idx" ON "ProductVariant"("productId", "isDefault");
CREATE UNIQUE INDEX "ProductVariant_one_default_per_product_key" ON "ProductVariant"("productId") WHERE "isDefault" = true;

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultVariantId_fkey" FOREIGN KEY ("defaultVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
