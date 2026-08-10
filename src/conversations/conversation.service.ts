import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type Conversation, type Customer, type Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type StructuredIntent } from '../ai/contracts/intent.contracts';
import { inboundChannels, inboundMessageTypes, type NormalizedInboundMessage } from './conversation.types';

type PersistedInbound = {
  message: Message;
  conversation: Conversation;
  created: boolean;
};

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async normalizeAndPersist(normalized: NormalizedInboundMessage): Promise<PersistedInbound> {
    this.validate(normalized);

    const existing = await this.prisma.message.findUnique({
      where: {
        merchantId_channel_externalMessageId: {
          merchantId: normalized.merchantId,
          channel: normalized.channel,
          externalMessageId: normalized.externalMessageId,
        },
      },
      include: { conversation: true },
    });
    if (existing) return { message: existing, conversation: existing.conversation, created: false };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.message.findUnique({
          where: {
            merchantId_channel_externalMessageId: {
              merchantId: normalized.merchantId,
              channel: normalized.channel,
              externalMessageId: normalized.externalMessageId,
            },
          },
          include: { conversation: true },
        });
        if (replay) return { message: replay, conversation: replay.conversation, created: false };

        const customer = await this.resolveCustomerInTransaction(tx, normalized);
        const conversation = await this.findOrCreateConversation(tx, normalized, customer);
        const message = await tx.message.create({
          data: {
            id: normalized.id,
            conversationId: conversation.id,
            merchantId: normalized.merchantId,
            channel: normalized.channel,
            externalMessageId: normalized.externalMessageId,
            direction: 'INBOUND',
            type: normalized.type,
            text: normalized.text,
            mediaUrl: normalized.mediaUrl,
            occurredAt: new Date(normalized.occurredAt),
          },
        });
        return { message, conversation, created: true };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const replay = await this.prisma.message.findUnique({
          where: {
            merchantId_channel_externalMessageId: {
              merchantId: normalized.merchantId,
              channel: normalized.channel,
              externalMessageId: normalized.externalMessageId,
            },
          },
          include: { conversation: true },
        });
        if (replay) return { message: replay, conversation: replay.conversation, created: false };
      }
      throw error;
    }
  }

  async resolveCustomer(normalized: NormalizedInboundMessage): Promise<Customer> {
    this.validate(normalized);
    return this.resolveCustomerInTransaction(this.prisma, normalized);
  }

  findById(merchantId: string, conversationId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({ where: { id: conversationId, merchantId } });
  }

  async saveReferenceState(merchantId: string, conversationId: string, referenceState: Prisma.InputJsonValue): Promise<void> {
    const result = await this.prisma.conversation.updateMany({
      where: { id: conversationId, merchantId },
      data: { referenceState },
    });
    if (result.count !== 1) throw new BadRequestException('conversation was not found for this merchant');
  }

  async persistIntent(merchantId: string, messageId: string, intent: StructuredIntent): Promise<void> {
    const result = await this.prisma.message.updateMany({
      where: { id: messageId, merchantId },
      data: { intent: intent as Prisma.InputJsonValue },
    });
    if (result.count !== 1) throw new BadRequestException('message was not found for this merchant');
  }

  async customerContext(merchantId: string, customerId: string): Promise<{
    customerId: string;
    hasUserAccount: boolean;
    conversationCount: number;
    orderCount: number;
  } | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
      select: {
        id: true,
        userId: true,
        _count: { select: { conversations: true } },
        user: { select: { _count: { select: { orders: true } } } },
      },
    });
    if (!customer) return null;
    return {
      customerId: customer.id,
      hasUserAccount: customer.userId !== null,
      conversationCount: customer._count.conversations,
      orderCount: customer.user?._count.orders ?? 0,
    };
  }

  private async resolveCustomerInTransaction(
    tx: Prisma.TransactionClient | PrismaService,
    normalized: NormalizedInboundMessage,
  ): Promise<Customer> {
    const identity = await tx.customerChannelIdentity.findUnique({
      where: {
        merchantId_channel_externalUserId: {
          merchantId: normalized.merchantId,
          channel: normalized.channel,
          externalUserId: normalized.externalUserId,
        },
      },
      include: { customer: true },
    });
    if (identity) {
      await tx.customerChannelIdentity.update({ where: { id: identity.id }, data: { lastSeenAt: new Date() } });
      return identity.customer;
    }

    const customer = await tx.customer.create({ data: { merchantId: normalized.merchantId } });
    await tx.customerChannelIdentity.create({
      data: {
        merchantId: normalized.merchantId,
        customerId: customer.id,
        channel: normalized.channel,
        externalUserId: normalized.externalUserId,
      },
    });
    return customer;
  }

  private async findOrCreateConversation(
    tx: Prisma.TransactionClient,
    normalized: NormalizedInboundMessage,
    customer: Customer,
  ): Promise<Conversation> {
    const existing = await tx.conversation.findUnique({
      where: {
        merchantId_channel_customerId: {
          merchantId: normalized.merchantId,
          channel: normalized.channel,
          customerId: customer.id,
        },
      },
    });
    if (existing) return existing;

    return tx.conversation.create({
      data: {
        merchantId: normalized.merchantId,
        customerId: customer.id,
        externalUserId: normalized.externalUserId,
        channel: normalized.channel,
      },
    });
  }

  private validate(normalized: NormalizedInboundMessage): void {
    if (!normalized || typeof normalized !== 'object') throw new BadRequestException('normalized message is required');
    if (!this.isNonEmptyString(normalized.id)) throw new BadRequestException('id is required');
    if (!this.isNonEmptyString(normalized.merchantId)) throw new BadRequestException('merchantId is required');
    if (!this.isNonEmptyString(normalized.externalMessageId)) throw new BadRequestException('externalMessageId is required');
    if (!this.isNonEmptyString(normalized.externalUserId)) throw new BadRequestException('externalUserId is required');
    if (!inboundChannels.includes(normalized.channel)) throw new BadRequestException('channel is invalid');
    if (!inboundMessageTypes.includes(normalized.type)) throw new BadRequestException('type is invalid');
    if (!this.isUtcIsoTimestamp(normalized.occurredAt)) throw new BadRequestException('occurredAt must be a valid ISO-8601 UTC timestamp');
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isUtcIsoTimestamp(value: unknown): value is string {
    return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
