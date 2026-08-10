import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type CommerceResponse, type DemandOutcome, AgentService } from '../ai/agent.service';
import { IntentParserService } from '../ai/intent-parser.service';
import { AuditService } from '../audit/audit.service';
import { ConversationService } from '../conversations/conversation.service';
import { HandoffService } from '../conversations/handoff.service';
import { ReferenceStateService } from '../conversations/reference-state.service';
import { type NormalizedInboundMessage } from '../conversations/conversation.types';
import { DemandService } from '../demand/demand.service';
import { PrismaService } from '../prisma/prisma.service';

export type WebMessageInput = {
  merchantId: string;
  text: string;
  externalMessageId?: string;
  externalUserId: string;
  correlationId: string;
  actorId?: string;
};

export type WebConversationResult = {
  created: boolean;
  conversationId: string;
  messageId: string;
  reply: CommerceResponse;
};

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly handoffs: HandoffService,
    private readonly parser: IntentParserService,
    private readonly references: ReferenceStateService,
    private readonly agent: AgentService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly demand: DemandService,
  ) {}

  async handleWebMessage(input: WebMessageInput): Promise<WebConversationResult> {
    this.validateMessage(input);
    return this.handleChannelMessage({
      id: randomUUID(),
      merchantId: input.merchantId,
      channel: 'web',
      externalMessageId: input.externalMessageId ?? randomUUID(),
      externalUserId: input.externalUserId,
      type: 'text',
      text: input.text,
      occurredAt: new Date().toISOString(),
    }, input.correlationId, input.actorId);
  }

  async handleChannelMessage(
    normalized: NormalizedInboundMessage,
    correlationId: string,
    actorId?: string,
  ): Promise<WebConversationResult> {
    this.validateNormalizedMessage(normalized);
    const persisted = await this.conversations.normalizeAndPersist(normalized);
    if (!persisted.created) {
      return {
        created: false,
        conversationId: persisted.conversation.id,
        messageId: persisted.message.id,
        reply: { kind: 'text', text: 'This message has already been processed.' },
      };
    }

    const text = normalized.text!;
    const parsedIntent = this.parser.parse(text);
    const parsed = parsedIntent.intent === 'other'
      ? { intent: 'product_search' as const, confidence: 0.8, missingInformation: [], attributes: parsedIntent.attributes, size: parsedIntent.size }
      : parsedIntent;
    const intent = await this.references.resolveAndPersist(
      normalized.merchantId,
      persisted.conversation.id,
      persisted.message.id,
      parsed,
      this.parser.referenceHint(text),
    );
    if (!this.autonomousToolsAllowed(persisted.conversation)) {
      const outcome: DemandOutcome = { merchantId: normalized.merchantId, conversationId: persisted.conversation.id, intent: intent.intent, kind: 'HANDED_OFF', confidence: intent.confidence, reason: 'HUMAN_HANDOFF_ACTIVE' };
      await this.recordOutcome(persisted.message.id, actorId, correlationId, outcome, { intent, channel: normalized.channel, occurredAt: normalized.occurredAt });
      return {
        created: true,
        conversationId: persisted.conversation.id,
        messageId: persisted.message.id,
        reply: { kind: 'human_handoff', text: 'This conversation is currently being handled by a human support specialist.' },
      };
    }
    const result = await this.agent.respond({
      merchantId: normalized.merchantId,
      conversationId: persisted.conversation.id,
      text,
      intent,
      correlationId,
    });
    if (result.response.kind === 'human_handoff') {
      await this.handoffs.requestHandoff({ merchantId: normalized.merchantId, conversationId: persisted.conversation.id, reasonCode: result.outcome.reason ?? 'HANDOFF_REQUIRED' });
    }
    await this.recordOutcome(persisted.message.id, actorId, correlationId, result.outcome, { intent, channel: normalized.channel, occurredAt: normalized.occurredAt });
    if (result.response.kind === 'product_carousel' && result.response.items.length > 0) {
      await this.references.recordCarousel(normalized.merchantId, persisted.conversation.id, result.response.items.map((item) => this.carouselReference(item)));
    }
    return {
      created: true,
      conversationId: persisted.conversation.id,
      messageId: persisted.message.id,
      reply: result.response,
    };
  }

  async history(merchantId: string, conversationId: string) {
    const conversation = await this.conversations.findById(merchantId, conversationId);
    if (!conversation) throw new NotFoundException('conversation was not found for this merchant');
    const messages = await this.prisma.message.findMany({
      where: { merchantId, conversationId },
      select: { id: true, direction: true, type: true, text: true, intent: true, occurredAt: true, createdAt: true },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    return { conversationId: conversation.id, messages };
  }

  private async recordOutcome(
    messageId: string,
    actorId: string | undefined,
    correlationId: string,
    outcome: DemandOutcome,
    demand: { intent: import('../ai/contracts/intent.contracts').StructuredIntent; channel: 'instagram' | 'whatsapp' | 'telegram' | 'web'; occurredAt: string },
  ): Promise<void> {
    await this.audit.record('conversation.message.processed', 'message', messageId, actorId, {
      correlationId,
      outcome: outcome.kind,
      intent: outcome.intent,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });
    try {
      await this.demand.recordOrUpdateDemand({
        merchantId: outcome.merchantId,
        conversationId: outcome.conversationId!,
        intent: demand.intent,
        channel: demand.channel,
        occurredAt: demand.occurredAt,
        outcome,
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  private carouselReference(item: Record<string, unknown>) {
    if (
      typeof item.productId !== 'string' || typeof item.variantId !== 'string'
      || !Number.isSafeInteger(item.priceMinor) || typeof item.currency !== 'string'
    ) {
      throw new BadRequestException('agent returned an invalid product carousel');
    }
    return { productId: item.productId, variantId: item.variantId, priceMinor: item.priceMinor as number, currency: item.currency };
  }

  private validateMessage(input: WebMessageInput): void {
    if (!input.merchantId.trim()) throw new BadRequestException('x-merchant-id is required');
    if (!input.externalUserId.trim()) throw new BadRequestException('externalUserId is required');
    if (!input.text.trim()) throw new BadRequestException('text is required');
    if (input.externalMessageId !== undefined && !input.externalMessageId.trim()) throw new BadRequestException('externalMessageId is invalid');
  }

  private validateNormalizedMessage(normalized: NormalizedInboundMessage): void {
    if (!normalized.merchantId.trim()) throw new BadRequestException('merchantId is required');
    if (!normalized.externalUserId.trim()) throw new BadRequestException('externalUserId is required');
    if (!normalized.externalMessageId.trim()) throw new BadRequestException('externalMessageId is required');
    if (!normalized.text?.trim()) throw new BadRequestException('text is required');
  }

  private autonomousToolsAllowed(conversation: { status: string; owner: string }): boolean {
    return conversation.status === 'ACTIVE' && conversation.owner === 'AI';
  }
}
