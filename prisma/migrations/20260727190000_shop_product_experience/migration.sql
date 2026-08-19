ALTER TABLE "Product"
  ADD COLUMN "material" TEXT,
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "care" TEXT,
  ADD COLUMN "featuredRank" INTEGER;

ALTER TABLE "Order"
  ADD COLUMN "shippingMethod" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "shippingLabel" TEXT NOT NULL DEFAULT 'Standard delivery',
  ADD COLUMN "shippingEta" TEXT NOT NULL DEFAULT '3–5 business days';

CREATE TYPE "CommentStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId", "productId")
);

CREATE TABLE "ProductComment" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "rating" INTEGER,
  "status" "CommentStatus" NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");
CREATE INDEX "Favorite_productId_idx" ON "Favorite"("productId");
CREATE INDEX "ProductComment_productId_status_createdAt_idx" ON "ProductComment"("productId", "status", "createdAt");
CREATE INDEX "ProductComment_authorId_idx" ON "ProductComment"("authorId");

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComment" ADD CONSTRAINT "ProductComment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComment" ADD CONSTRAINT "ProductComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
