-- Phase 1 B2B foundation is intentionally additive. Existing B2C products,
-- prices, inventory and orders remain unchanged; the backfill below creates
-- a separate default variant as the bridge for future B2B catalog features.

CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "CompanyMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "CompanyMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'BUYER', 'VIEWER');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "legalName" TEXT,
  "taxRegistrationNumber" TEXT,
  "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "customerGroupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMembership" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CompanyMembershipRole" NOT NULL DEFAULT 'BUYER',
  "status" "CompanyMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- ProductVariant existed in an older shop migration with a smaller shape.
-- Keep that table and its rows when upgrading such a database; a clean
-- database receives the complete Phase 1 shape below.
DO $$
BEGIN
  IF to_regclass('"ProductVariant"') IS NULL THEN
    CREATE TABLE "ProductVariant" (
      "id" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "sku" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "options" JSONB,
      "basePriceMinor" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "imageUrl" TEXT,
      "stockQty" INTEGER NOT NULL DEFAULT 0,
      "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
      "minimumOrderQty" INTEGER NOT NULL DEFAULT 1,
      "packSize" INTEGER NOT NULL DEFAULT 1,
      "quantityIncrement" INTEGER NOT NULL DEFAULT 1,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "position" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "options" JSONB,
  ADD COLUMN IF NOT EXISTS "basePriceMinor" INTEGER,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "lowStockThreshold" INTEGER,
  ADD COLUMN IF NOT EXISTS "minimumOrderQty" INTEGER,
  ADD COLUMN IF NOT EXISTS "packSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "quantityIncrement" INTEGER,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "position" INTEGER;

-- Legacy variants used priceMinor and otherAttributes/color/size. Preserve
-- those columns, but copy their values into the new B2B-compatible fields.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductVariant' AND column_name = 'priceMinor') THEN
    EXECUTE 'UPDATE "ProductVariant" SET "basePriceMinor" = COALESCE("basePriceMinor", "priceMinor") WHERE "basePriceMinor" IS NULL';
  ELSE
    UPDATE "ProductVariant" SET "basePriceMinor" = COALESCE("basePriceMinor", 0) WHERE "basePriceMinor" IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductVariant' AND column_name = 'otherAttributes') THEN
    EXECUTE 'UPDATE "ProductVariant" SET "options" = COALESCE("options", "otherAttributes") WHERE "options" IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductVariant' AND column_name = 'color') THEN
    EXECUTE 'UPDATE "ProductVariant" SET "options" = COALESCE("options", ''{}''::jsonb) || CASE WHEN "color" IS NULL THEN ''{}''::jsonb ELSE jsonb_build_object(''color'', "color") END';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductVariant' AND column_name = 'size') THEN
    EXECUTE 'UPDATE "ProductVariant" SET "options" = COALESCE("options", ''{}''::jsonb) || CASE WHEN "size" IS NULL THEN ''{}''::jsonb ELSE jsonb_build_object(''size'', "size") END';
  END IF;
END $$;

UPDATE "ProductVariant" v
SET
  "name" = COALESCE(NULLIF(v."name", ''), p."name", 'Legacy variant'),
  "imageUrl" = COALESCE(v."imageUrl", p."imageUrl"),
  "lowStockThreshold" = COALESCE(v."lowStockThreshold", p."lowStockThreshold", 5),
  "isActive" = COALESCE(v."isActive", p."isActive", true),
  "minimumOrderQty" = COALESCE(v."minimumOrderQty", 1),
  "packSize" = COALESCE(v."packSize", 1),
  "quantityIncrement" = COALESCE(v."quantityIncrement", 1),
  "position" = COALESCE(v."position", 0)
FROM "Product" p
WHERE p."id" = v."productId";

UPDATE "ProductVariant"
SET
  "name" = COALESCE(NULLIF("name", ''), 'Legacy variant'),
  "basePriceMinor" = COALESCE("basePriceMinor", 0),
  "lowStockThreshold" = COALESCE("lowStockThreshold", 5),
  "minimumOrderQty" = COALESCE("minimumOrderQty", 1),
  "packSize" = COALESCE("packSize", 1),
  "quantityIncrement" = COALESCE("quantityIncrement", 1),
  "isActive" = COALESCE("isActive", true),
  "position" = COALESCE("position", 0)
WHERE "name" IS NULL OR "name" = '' OR "basePriceMinor" IS NULL OR "lowStockThreshold" IS NULL
   OR "minimumOrderQty" IS NULL OR "packSize" IS NULL OR "quantityIncrement" IS NULL
   OR "isActive" IS NULL OR "position" IS NULL;

ALTER TABLE "ProductVariant"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "basePriceMinor" SET NOT NULL,
  ALTER COLUMN "lowStockThreshold" SET NOT NULL,
  ALTER COLUMN "minimumOrderQty" SET NOT NULL,
  ALTER COLUMN "packSize" SET NOT NULL,
  ALTER COLUMN "quantityIncrement" SET NOT NULL,
  ALTER COLUMN "isActive" SET NOT NULL,
  ALTER COLUMN "position" SET NOT NULL;

CREATE TABLE "PriceList" (
  "id" TEXT NOT NULL,
  "customerGroupId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceListItem" (
  "id" TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceTier" (
  "id" TEXT NOT NULL,
  "priceListItemId" TEXT NOT NULL,
  "minimumQuantity" INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key" ON "CompanyMembership"("companyId", "userId");
CREATE UNIQUE INDEX "CustomerGroup_code_key" ON "CustomerGroup"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX "PriceList_code_key" ON "PriceList"("code");
CREATE UNIQUE INDEX "PriceListItem_priceListId_variantId_key" ON "PriceListItem"("priceListId", "variantId");
CREATE UNIQUE INDEX "PriceTier_priceListItemId_minimumQuantity_key" ON "PriceTier"("priceListItemId", "minimumQuantity");

CREATE INDEX "Company_status_updatedAt_idx" ON "Company"("status", "updatedAt");
CREATE INDEX "Company_customerGroupId_idx" ON "Company"("customerGroupId");
CREATE INDEX "CompanyMembership_userId_status_idx" ON "CompanyMembership"("userId", "status");
CREATE INDEX "CompanyMembership_companyId_status_role_idx" ON "CompanyMembership"("companyId", "status", "role");
CREATE INDEX "CustomerGroup_isActive_name_idx" ON "CustomerGroup"("isActive", "name");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_isActive_position_idx" ON "ProductVariant"("productId", "isActive", "position");
CREATE INDEX IF NOT EXISTS "ProductVariant_isActive_sku_idx" ON "ProductVariant"("isActive", "sku");
CREATE INDEX "PriceList_customerGroupId_isActive_priority_idx" ON "PriceList"("customerGroupId", "isActive", "priority");
CREATE INDEX "PriceList_currency_isActive_startsAt_endsAt_idx" ON "PriceList"("currency", "isActive", "startsAt", "endsAt");
CREATE INDEX "PriceListItem_variantId_idx" ON "PriceListItem"("variantId");
CREATE INDEX "PriceTier_priceListItemId_minimumQuantity_idx" ON "PriceTier"("priceListItemId", "minimumQuantity");

-- Copy the current B2C product values into a stable default variant. The
-- deterministic ID and SKU make the operation safe to re-run in a rehearsal
-- database and make it possible to identify the bridge records later.
INSERT INTO "ProductVariant" (
  "id",
  "productId",
  "sku",
  "name",
  "options",
  "basePriceMinor",
  "currency",
  "imageUrl",
  "stockQty",
  "lowStockThreshold",
  "minimumOrderQty",
  "packSize",
  "quantityIncrement",
  "isActive",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-' || p."id",
  p."id",
  'LEGACY-' || p."id",
  p."name",
  '{}'::jsonb,
  p."priceMinor",
  p."currency",
  p."imageUrl",
  p."stockQty",
  p."lowStockThreshold",
  1,
  1,
  1,
  p."isActive",
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProductVariant" v
  WHERE v."productId" = p."id"
);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_basePriceMinor_nonnegative_chk" CHECK ("basePriceMinor" >= 0),
  ADD CONSTRAINT "ProductVariant_stockQty_nonnegative_chk" CHECK ("stockQty" >= 0),
  ADD CONSTRAINT "ProductVariant_lowStockThreshold_nonnegative_chk" CHECK ("lowStockThreshold" >= 0),
  ADD CONSTRAINT "ProductVariant_minimumOrderQty_positive_chk" CHECK ("minimumOrderQty" >= 1),
  ADD CONSTRAINT "ProductVariant_packSize_positive_chk" CHECK ("packSize" >= 1),
  ADD CONSTRAINT "ProductVariant_quantityIncrement_positive_chk" CHECK ("quantityIncrement" >= 1);

ALTER TABLE "PriceList"
  ADD CONSTRAINT "PriceList_priority_nonnegative_chk" CHECK ("priority" >= 0),
  ADD CONSTRAINT "PriceList_dates_valid_chk" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "PriceListItem"
  ADD CONSTRAINT "PriceListItem_priceMinor_nonnegative_chk" CHECK ("priceMinor" >= 0);

ALTER TABLE "PriceTier"
  ADD CONSTRAINT "PriceTier_minimumQuantity_positive_chk" CHECK ("minimumQuantity" >= 1),
  ADD CONSTRAINT "PriceTier_unitPriceMinor_nonnegative_chk" CHECK ("unitPriceMinor" >= 0);

ALTER TABLE "Company" ADD CONSTRAINT "Company_customerGroupId_fkey"
  FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_productId_fkey') THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_customerGroupId_fkey"
  FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_priceListItemId_fkey"
  FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
