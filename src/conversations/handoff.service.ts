import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HumanHandoffStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type HandoffCommand = {
  merchantId: string;
  conversationId: string;
  actorId?: string;
};

type HandoffRequest = HandoffCommand & {
  reasonCode: string;
};

type HandoffSummary = {
  intent: string;
  products: Array<{ id: string; name: string }>;
  unresolvedIssue: { reasonCode: string; agentNote: string };
};

@Injectable()
export class HandoffService {
  constructor(private readonly prisma: PrismaService) {}

  async requestHandoff(input: HandoffRequest) {
    this.validateRequest(input);
    return this.prisma.$transaction(async (tx) => {
      if (input.actorId) await this.requireMembership(tx, input.merchantId, input.actorId);
      const conversation = await tx.conversation.findFirst({ where: { id: input.conversationId, merchantId: input.merchantId } });
      if (!conversation) throw new NotFoundException('conversation was not found for this merchant');
      const transition = await tx.conversation.updateMany({
        where: { id: input.conversationId, merchantId: input.merchantId, status: 'ACTIVE', owner: 'AI' },
        data: { status: 'HANDOFF_REQUESTED', owner: 'AI' },
      });
      if (transition.count !== 1) {
        const existing = await tx.humanHandoff.findFirst({
          where: { merchantId: input.merchantId, conversationId: input.conversationId, status: HumanHandoffStatus.REQUESTED },
          orderBy: { requestedAt: 'desc' },
        });
        if (existing) return existing;
        throw new ConflictException('conversation is not available for handoff');
      }
      const handoff = await tx.humanHandoff.create({
        data: {
          merchantId: input.merchantId,
          conversationId: input.conversationId,
          reasonCode: input.reasonCode,
          summary: await this.summaryFor(tx, conversation, input.reasonCode),
        },
      });
      await this.audit(tx, 'conversation.handoff_requested', input.conversationId, input.actorId, { handoffId: handoff.id, reasonCode: input.reasonCode });
      return handoff;
    });
  }

  async acceptHandoff(input: Required<HandoffCommand>) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireMembership(tx, input.merchantId, input.actorId);
      await this.requireConversation(tx, input.merchantId, input.conversationId);
      const handoff = await tx.humanHandoff.findFirst({
        where: { merchantId: input.merchantId, conversationId: input.conversationId, status: HumanHandoffStatus.REQUESTED },
        orderBy: { requestedAt: 'desc' },
      });
      if (!handoff) throw new ConflictException('handoff is not available for acceptance');
      const handoffTransition = await tx.humanHandoff.updateMany({
        where: { id: handoff.id, status: HumanHandoffStatus.REQUESTED },
        data: { status: HumanHandoffStatus.ACCEPTED, acceptedById: input.actorId },
      });
      if (handoffTransition.count !== 1) throw new ConflictException('handoff is not available for acceptance');
      const conversationTransition = await tx.conversation.updateMany({
        where: { id: input.conversationId, merchantId: input.merchantId, status: 'HANDOFF_REQUESTED', owner: 'AI' },
        data: { status: 'HUMAN_ACTIVE', owner: 'HUMAN' },
      });
      if (conversationTransition.count !== 1) throw new ConflictException('conversation is not available for acceptance');
      const accepted = await tx.humanHandoff.findUniqueOrThrow({ where: { id: handoff.id } });
      await this.audit(tx, 'conversation.handoff_accepted', input.conversationId, input.actorId, { handoffId: handoff.id });
      return accepted;
    });
  }

  async releaseToAi(input: Required<HandoffCommand>) {
    return this.complete(input, 'ACTIVE', 'AI', 'conversation.handoff_released');
  }

  async resolveHandoff(input: Required<HandoffCommand>) {
    return this.complete(input, 'CLOSED', 'HUMAN', 'conversation.handoff_resolved');
  }

  async handoffsForMerchant(merchantId: string, actorId?: string) {
    if (actorId) await this.requireMembership(this.prisma, merchantId, actorId);
    return this.prisma.humanHandoff.findMany({
      where: { merchantId },
      select: { id: true, conversationId: true, reasonCode: true, status: true, requestedAt: true, acceptedById: true, resolvedAt: true, summary: true },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  private async complete(input: Required<HandoffCommand>, status: string, owner: string, action: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireMembership(tx, input.merchantId, input.actorId);
      await this.requireConversation(tx, input.merchantId, input.conversationId);
      const handoff = await tx.humanHandoff.findFirst({
        where: { merchantId: input.merchantId, conversationId: input.conversationId, status: HumanHandoffStatus.ACCEPTED },
        orderBy: { requestedAt: 'desc' },
      });
      if (!handoff) throw new ConflictException('handoff is not active');
      if (!(await this.canManageAcceptedHandoff(tx, input.merchantId, input.actorId, handoff.acceptedById))) {
        throw new ForbiddenException('only the accepting operator or merchant admin can manage this handoff');
      }
      const conversationTransition = await tx.conversation.updateMany({
        where: { id: input.conversationId, merchantId: input.merchantId, status: 'HUMAN_ACTIVE', owner: 'HUMAN' },
        data: { status, owner },
      });
      if (conversationTransition.count !== 1) throw new ConflictException('conversation is not active for a human operator');
      const handoffTransition = await tx.humanHandoff.updateMany({
        where: { id: handoff.id, status: HumanHandoffStatus.ACCEPTED },
        data: { status: HumanHandoffStatus.RESOLVED, resolvedAt: new Date() },
      });
      if (handoffTransition.count !== 1) throw new ConflictException('handoff is not active');
      const resolved = await tx.humanHandoff.findUniqueOrThrow({ where: { id: handoff.id } });
      await this.audit(tx, action, input.conversationId, input.actorId, { handoffId: handoff.id });
      return resolved;
    });
  }

  private async requireConversation(tx: Prisma.TransactionClient, merchantId: string, conversationId: string) {
    const conversation = await tx.conversation.findFirst({ where: { id: conversationId, merchantId } });
    if (!conversation) throw new NotFoundException('conversation was not found for this merchant');
    return conversation;
  }

  private async canManageAcceptedHandoff(tx: Prisma.TransactionClient, merchantId: string, actorId: string, acceptedById: string | null) {
    if (acceptedById === actorId) return true;
    return (await tx.merchantMembership.count({ where: { merchantId, userId: actorId, role: 'admin' } })) > 0;
  }

  private async requireMembership(tx: Prisma.TransactionClient | PrismaService, merchantId: string, actorId: string): Promise<void> {
    if ((await tx.merchantMembership.count({ where: { merchantId, userId: actorId } })) === 0) {
      throw new NotFoundException('merchant was not found for this user');
    }
  }

  private async summaryFor(tx: Prisma.TransactionClient, conversation: { id: string; merchantId: string; referenceState: Prisma.JsonValue | null }, reasonCode: string): Promise<HandoffSummary> {
    const message = await tx.message.findFirst({
      where: { merchantId: conversation.merchantId, conversationId: conversation.id },
      select: { intent: true },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const intent = this.intent(message?.intent);
    const productIds = [...new Set([...this.productIds(message?.intent), ...this.productIds(conversation.referenceState)])];
    const products = productIds.length === 0
      ? []
      : await tx.product.findMany({ where: { merchantId: conversation.merchantId, id: { in: productIds } }, select: { id: true, name: true } });
    return { intent, products, unresolvedIssue: { reasonCode, agentNote: 'The automated assistant requested human support.' } };
  }

  private intent(value: Prisma.JsonValue | null | undefined): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'other';
    const intent = (value as Record<string, unknown>).intent;
    return typeof intent === 'string' ? intent : 'other';
  }

  private productIds(value: Prisma.JsonValue | null | undefined): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const referenceProductIds = Array.isArray(record.referenceProductIds) ? record.referenceProductIds.filter((id): id is string => typeof id === 'string') : [];
    const carouselProductIds = Array.isArray(record.lastCarousel)
      ? record.lastCarousel.flatMap((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).productId === 'string' ? [(item as Record<string, unknown>).productId as string] : [])
      : [];
    return [...referenceProductIds, ...carouselProductIds];
  }

  private async audit(tx: Prisma.TransactionClient, action: string, conversationId: string, actorId: string | undefined, metadata: Record<string, unknown>): Promise<void> {
    await tx.auditLog.create({ data: { action, targetType: 'conversation', targetId: conversationId, actorId, metadata: metadata as Prisma.InputJsonValue } });
  }

  private validateRequest(input: HandoffRequest): void {
    if (!input.merchantId.trim() || !input.conversationId.trim()) throw new NotFoundException('conversation was not found for this merchant');
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(input.reasonCode)) throw new ConflictException('handoff reasonCode is invalid');
  }
}
