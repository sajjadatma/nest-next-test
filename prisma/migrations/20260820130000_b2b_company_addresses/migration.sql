-- Company-owned addresses are separate from personal B2C addresses.
CREATE TABLE "CompanyAddress" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "label" TEXT,
  "recipientName" TEXT NOT NULL,
  "phone" TEXT,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT NOT NULL,
  "region" TEXT,
  "postalCode" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
  "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyAddress_companyId_archivedAt_updatedAt_idx" ON "CompanyAddress"("companyId", "archivedAt", "updatedAt");
CREATE INDEX "CompanyAddress_companyId_isDefaultShipping_archivedAt_idx" ON "CompanyAddress"("companyId", "isDefaultShipping", "archivedAt");
CREATE INDEX "CompanyAddress_companyId_isDefaultBilling_archivedAt_idx" ON "CompanyAddress"("companyId", "isDefaultBilling", "archivedAt");

ALTER TABLE "CompanyAddress"
  ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
