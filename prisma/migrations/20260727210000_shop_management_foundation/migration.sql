ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PACKING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "CommentStatus" ADD VALUE IF NOT EXISTS 'PENDING';

CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "InventoryMovementReason" AS ENUM ('OPENING_BALANCE', 'ORDER_RESERVATION', 'ORDER_CANCELLATION', 'ADJUSTMENT', 'RETURN');
CREATE TYPE "PromotionType" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ProductComment" ADD COLUMN "moderationReason" TEXT, ADD COLUMN "moderatedAt" TIMESTAMP(3), ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Order" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "promotionCode" TEXT, ADD COLUMN "promotionId" TEXT;

CREATE TABLE "ShippingMethod" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL, "description" TEXT,
  "eta" TEXT NOT NULL, "priceMinor" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "orderId" TEXT, "actorId" TEXT,
  "reason" "InventoryMovementReason" NOT NULL, "quantityDelta" INTEGER NOT NULL, "stockAfter" INTEGER NOT NULL,
  "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderNote" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "isCustomerVisible" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderStatusEvent" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "actorId" TEXT, "previousStatus" "OrderStatus",
  "status" "OrderStatus" NOT NULL, "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "carrier" TEXT, "service" TEXT,
  "trackingNumber" TEXT, "trackingUrl" TEXT, "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "packedAt" TIMESTAMP(3), "shippedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Promotion" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "type" "PromotionType" NOT NULL, "value" INTEGER NOT NULL,
  "minimumSubtotalMinor" INTEGER, "usageLimit" INTEGER, "usedCount" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PromotionRedemption" (
  "id" TEXT NOT NULL, "promotionId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShippingMethod_code_key" ON "ShippingMethod"("code");
CREATE INDEX "ShippingMethod_isActive_position_idx" ON "ShippingMethod"("isActive", "position");
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");
CREATE INDEX "InventoryMovement_actorId_createdAt_idx" ON "InventoryMovement"("actorId", "createdAt");
CREATE INDEX "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");
CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");
CREATE INDEX "Shipment_orderId_createdAt_idx" ON "Shipment"("orderId", "createdAt");
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
CREATE INDEX "Promotion_isActive_startsAt_endsAt_idx" ON "Promotion"("isActive", "startsAt", "endsAt");
CREATE UNIQUE INDEX "PromotionRedemption_orderId_key" ON "PromotionRedemption"("orderId");
CREATE INDEX "PromotionRedemption_promotionId_createdAt_idx" ON "PromotionRedemption"("promotionId", "createdAt");
CREATE INDEX "ProductComment_status_createdAt_idx" ON "ProductComment"("status", "createdAt");
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");

ALTER TABLE "ProductComment" ADD CONSTRAINT "ProductComment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "InventoryMovement" ("id", "productId", "reason", "quantityDelta", "stockAfter", "note")
SELECT 'opening-' || "id", "id", 'OPENING_BALANCE', "stockQty", "stockQty", 'Opening balance created by shop management migration'
FROM "Product";
