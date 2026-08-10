CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerChannelIdentity" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "externalUserId" TEXT NOT NULL,
  "externalHandle" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerChannelIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "customerId" TEXT,
  "externalUserId" TEXT,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "owner" TEXT NOT NULL DEFAULT 'AI',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "externalMessageId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "text" TEXT,
  "mediaUrl" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
CREATE UNIQUE INDEX "CustomerChannelIdentity_merchantId_channel_externalUserId_key" ON "CustomerChannelIdentity"("merchantId", "channel", "externalUserId");
CREATE INDEX "CustomerChannelIdentity_customerId_idx" ON "CustomerChannelIdentity"("customerId");
CREATE UNIQUE INDEX "Conversation_merchantId_channel_customerId_key" ON "Conversation"("merchantId", "channel", "customerId");
CREATE UNIQUE INDEX "Conversation_merchantId_channel_externalUserId_key" ON "Conversation"("merchantId", "channel", "externalUserId");
CREATE INDEX "Conversation_merchantId_updatedAt_idx" ON "Conversation"("merchantId", "updatedAt");
CREATE UNIQUE INDEX "Message_merchantId_channel_externalMessageId_key" ON "Message"("merchantId", "channel", "externalMessageId");
CREATE INDEX "Message_conversationId_occurredAt_idx" ON "Message"("conversationId", "occurredAt");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerChannelIdentity" ADD CONSTRAINT "CustomerChannelIdentity_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerChannelIdentity" ADD CONSTRAINT "CustomerChannelIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
