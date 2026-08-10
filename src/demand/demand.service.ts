import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type StructuredIntent } from '../ai/contracts/intent.contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  demandChannels,
  demandOutcomeTransitions,
  demandOutcomes,
  DEMAND_PRIVACY_VERSION,
  type DemandOutcomeKind,
} from './demand.constants';

export type RecordDemandInput = {
  merchantId: string;
  conversationId: string;
  channel: (typeof demandChannels)[number];
  occurredAt: string;
  intent: StructuredIntent;
  outcome: {
    merchantId: string;
    conversationId?: string;
    kind: DemandOutcomeKind;
    confidence: number;
    reason?: string;
  };
};

type NormalizedDemandInput = Omit<RecordDemandInput, 'occurredAt' | 'intent'> & {
  occurredAt: Date;
  intent: StructuredIntent & { attributes: Record<string, string> };
  intentKey: string;
};

const sensitiveAttributeKey = /(?:customer|user|email|phone|handle|message|text|raw|payload)/i;
const canonicalAttributeKey = /^[a-z][a-z0-9_]{0,63}$/;
const deterministicReasonCode = /^[A-Z][A-Z0-9_]{0,63}$/;

@Injectable()
export class DemandService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOrUpdateDemand(input: RecordDemandInput) {
    const normalized = this.normalize(input);
    const existing = await this.prisma.demandEvent.findUnique({
      where: {
        merchantId_conversationId_intentKey: {
          merchantId: normalized.merchantId,
          conversationId: normalized.conversationId,
          intentKey: normalized.intentKey,
        },
      },
    });
    if (existing) return this.transition(existing, normalized);

    try {
      return await this.prisma.demandEvent.create({
        data: {
          merchantId: normalized.merchantId,
          conversationId: normalized.conversationId,
          intentKey: normalized.intentKey,
          occurredAt: normalized.occurredAt,
          channel: normalized.channel,
          category: normalized.intent.category,
          canonicalAttributes: normalized.intent.attributes,
          size: normalized.intent.size,
          budgetMin: normalized.intent.budgetMin,
          budgetMax: normalized.intent.budgetMax,
          currency: normalized.intent.currency,
          purchaseIntent: normalized.intent.purchaseIntent,
          confidence: normalized.intent.confidence,
          outcome: normalized.outcome.kind,
          failureReason: normalized.outcome.reason,
          privacyVersion: DEMAND_PRIVACY_VERSION,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const replay = await this.prisma.demandEvent.findUniqueOrThrow({
        where: {
          merchantId_conversationId_intentKey: {
            merchantId: normalized.merchantId,
            conversationId: normalized.conversationId,
            intentKey: normalized.intentKey,
          },
        },
      });
      return this.transition(replay, normalized);
    }
  }

  eventsForMerchant(merchantId: string) {
    if (!this.nonEmptyString(merchantId)) throw new BadRequestException('merchantId is required');
    return this.prisma.demandEvent.findMany({
      where: { merchantId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
  }

  eventForMerchant(merchantId: string, id: string) {
    if (!this.nonEmptyString(merchantId) || !this.nonEmptyString(id)) throw new BadRequestException('merchantId and demand event id are required');
    return this.prisma.demandEvent.findFirst({ where: { id, merchantId } });
  }

  private async transition(existing: { id: string; outcome: DemandOutcomeKind }, input: NormalizedDemandInput) {
    if (existing.outcome === input.outcome.kind) return existing;
    if (!demandOutcomeTransitions[existing.outcome].includes(input.outcome.kind)) {
      throw new ConflictException(`invalid demand outcome transition: ${existing.outcome} -> ${input.outcome.kind}`);
    }
    return this.prisma.demandEvent.update({
      where: { id: existing.id },
      data: { outcome: input.outcome.kind, failureReason: input.outcome.reason },
    });
  }

  private normalize(input: RecordDemandInput): NormalizedDemandInput {
    if (!input || typeof input !== 'object') throw new BadRequestException('demand input is required');
    if (!this.nonEmptyString(input.merchantId) || !this.nonEmptyString(input.conversationId)) {
      throw new BadRequestException('merchantId and conversationId are required');
    }
    if (input.outcome.merchantId !== input.merchantId || input.outcome.conversationId !== input.conversationId) {
      throw new BadRequestException('demand outcome identity is invalid');
    }
    if (!demandChannels.includes(input.channel)) throw new BadRequestException('demand channel is invalid');
    const occurredAt = new Date(input.occurredAt);
    if (!input.occurredAt.endsWith('Z') || Number.isNaN(occurredAt.valueOf())) throw new BadRequestException('occurredAt must be a valid ISO-8601 UTC timestamp');
    if (!demandOutcomes.includes(input.outcome.kind)) throw new BadRequestException('demand outcome is invalid');
    if (!Number.isFinite(input.intent.confidence) || input.intent.confidence < 0 || input.intent.confidence > 1) throw new BadRequestException('demand confidence is invalid');
    if (!Number.isFinite(input.outcome.confidence) || input.outcome.confidence < 0 || input.outcome.confidence > 1) throw new BadRequestException('demand outcome confidence is invalid');
    if (input.intent.budgetMin !== undefined && (!Number.isSafeInteger(input.intent.budgetMin) || input.intent.budgetMin < 0)) throw new BadRequestException('budgetMin is invalid');
    if (input.intent.budgetMax !== undefined && (!Number.isSafeInteger(input.intent.budgetMax) || input.intent.budgetMax < 0)) throw new BadRequestException('budgetMax is invalid');
    if (input.intent.budgetMin !== undefined && input.intent.budgetMax !== undefined && input.intent.budgetMin > input.intent.budgetMax) throw new BadRequestException('budget range is invalid');
    if (input.outcome.reason !== undefined && !deterministicReasonCode.test(input.outcome.reason)) throw new BadRequestException('demand failure reason is invalid');

    const attributes = this.canonicalAttributes(input.intent.attributes);
    const intent = { ...input.intent, ...(Object.keys(attributes).length > 0 ? { attributes } : { attributes: {} }) };
    return { ...input, occurredAt, intent, intentKey: this.intentKey(intent) };
  }

  private canonicalAttributes(attributes: StructuredIntent['attributes']): Record<string, string> {
    if (!attributes) return {};
    const canonical = Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        if (!canonicalAttributeKey.test(key) || sensitiveAttributeKey.test(key) || !this.nonEmptyString(value) || value.length > 64 || value.includes('@') || /\d{7,}/.test(value)) {
          throw new BadRequestException('demand attributes must be canonical and privacy-safe');
        }
        return [key, value] as const;
      });
    return Object.fromEntries(canonical);
  }

  private intentKey(intent: StructuredIntent): string {
    const canonical = {
      category: intent.category ?? null,
      attributes: intent.attributes ?? {},
      size: intent.size ?? null,
      budgetMin: intent.budgetMin ?? null,
      budgetMax: intent.budgetMax ?? null,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
