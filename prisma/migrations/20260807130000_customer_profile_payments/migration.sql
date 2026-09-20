CREATE TYPE "AddressType" AS ENUM ('SHIPPING', 'BILLING', 'BOTH');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH_ON_DELIVERY', 'CARD', 'WALLET', 'BANK_TRANSFER');

CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phone" TEXT,
  "avatarUrl" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en-US',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Address" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "type" "AddressType" NOT NULL DEFAULT 'SHIPPING',
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
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Address_userId_deletedAt_updatedAt_idx" ON "Address"("userId", "deletedAt", "updatedAt");
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
  "emailMarketing" BOOLEAN NOT NULL DEFAULT false,
  "smsOrderUpdates" BOOLEAN NOT NULL DEFAULT false,
  "preferredCurrency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerPreference_userId_key" ON "CustomerPreference"("userId");
ALTER TABLE "CustomerPreference" ADD CONSTRAINT "CustomerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsentRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsentRecord_userId_type_grantedAt_idx" ON "ConsentRecord"("userId", "type", "grantedAt");
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'CANCELLED', 'COMPLETED');
CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountDeletionRequest_userId_status_requestedAt_idx" ON "AccountDeletionRequest"("userId", "status", "requestedAt");
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "sourceAddressId" TEXT;
CREATE INDEX "Order_sourceAddressId_idx" ON "Order"("sourceAddressId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceAddressId_fkey" FOREIGN KEY ("sourceAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'manual',
  "providerPaymentId" TEXT,
  "methodType" "PaymentMethodType" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_customerId_createdAt_idx" ON "Payment"("customerId", "createdAt");
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");
CREATE INDEX "Payment_provider_providerPaymentId_idx" ON "Payment"("provider", "providerPaymentId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER,
  "providerEventId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SavedPaymentMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMethodId" TEXT NOT NULL,
  "type" "PaymentMethodType" NOT NULL,
  "brand" TEXT,
  "last4" TEXT,
  "expiryMonth" INTEGER,
  "expiryYear" INTEGER,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedPaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedPaymentMethod_provider_providerMethodId_key" ON "SavedPaymentMethod"("provider", "providerMethodId");
CREATE INDEX "SavedPaymentMethod_userId_isDefault_idx" ON "SavedPaymentMethod"("userId", "isDefault");
ALTER TABLE "SavedPaymentMethod" ADD CONSTRAINT "SavedPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
