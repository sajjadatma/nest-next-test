import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type StructuredIntent } from '../ai/contracts/intent.contracts';
import { type ReferenceHint } from '../ai/intent-parser.service';
import { ConversationService } from './conversation.service';

export type CarouselItemReference = {
  productId: string;
  variantId: string;
  priceMinor: number;
  currency: string;
};

export type ConversationReferenceState = {
  lastCarousel?: CarouselItemReference[];
  lastIntent?: StructuredIntent;
};

@Injectable()
export class ReferenceStateService {
  constructor(private readonly conversations: ConversationService) {}

  async recordCarousel(merchantId: string, conversationId: string, items: CarouselItemReference[]): Promise<void> {
    if (items.length === 0) throw new BadRequestException('carousel items are required');
    this.validateCarousel(items);
    const conversation = await this.requireConversation(merchantId, conversationId);
    await this.conversations.saveReferenceState(merchantId, conversationId, {
      ...this.state(conversation.referenceState),
      lastCarousel: items,
    });
  }

  async resolveAndPersist(
    merchantId: string,
    conversationId: string,
    messageId: string,
    intent: StructuredIntent,
    referenceHint?: ReferenceHint,
  ): Promise<StructuredIntent> {
    const conversation = await this.requireConversation(merchantId, conversationId);
    const state = this.state(conversation.referenceState);
    const resolved = this.resolve(intent, state, referenceHint);
    await this.conversations.persistIntent(merchantId, messageId, resolved);
    await this.conversations.saveReferenceState(merchantId, conversationId, { ...state, lastIntent: resolved });
    return resolved;
  }

  resolve(intent: StructuredIntent, state: ConversationReferenceState, referenceHint?: ReferenceHint): StructuredIntent {
    const merged = this.mergeRefinement(intent, state.lastIntent);
    const carousel = state.lastCarousel;
    if (referenceHint === 'cheaper') return { ...merged, referenceProductIds: [this.cheapest(carousel).productId] };
    if (referenceHint === 'second_and_third') {
      return { ...merged, referenceProductIds: [this.byPosition(carousel, 2).productId, this.byPosition(carousel, 3).productId] };
    }
    const position = referenceHint === 'second' ? 2 : referenceHint === 'third' ? 3 : undefined;
    return position ? { ...merged, referenceProductIds: [this.byPosition(carousel, position).productId] } : merged;
  }

  private async requireConversation(merchantId: string, conversationId: string) {
    const conversation = await this.conversations.findById(merchantId, conversationId);
    if (!conversation) throw new NotFoundException('conversation was not found for this merchant');
    return conversation;
  }

  private mergeRefinement(intent: StructuredIntent, previous?: StructuredIntent): StructuredIntent {
    if (intent.intent !== 'refine_search' || !previous) return intent;
    return {
      ...previous,
      ...intent,
      attributes: { ...previous.attributes, ...intent.attributes },
      size: intent.size ?? previous.size,
      missingInformation: intent.missingInformation,
    };
  }


  private cheapest(carousel: CarouselItemReference[] | undefined): CarouselItemReference {
    return this.requireCarousel(carousel).slice().sort((left, right) => left.priceMinor - right.priceMinor || left.productId.localeCompare(right.productId))[0];
  }

  private byPosition(carousel: CarouselItemReference[] | undefined, position: number): CarouselItemReference {
    const item = this.requireCarousel(carousel)[position - 1];
    if (!item) throw new BadRequestException(`carousel position ${position} is unavailable`);
    return item;
  }

  private requireCarousel(carousel: CarouselItemReference[] | undefined): CarouselItemReference[] {
    if (!carousel?.length) throw new BadRequestException('no product carousel is available');
    return carousel;
  }

  private state(value: unknown): ConversationReferenceState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as ConversationReferenceState;
  }

  private validateCarousel(items: CarouselItemReference[]): void {
    if (items.some((item) => !item.productId || !item.variantId || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0 || !item.currency)) {
      throw new BadRequestException('carousel items are invalid');
    }
  }
}
