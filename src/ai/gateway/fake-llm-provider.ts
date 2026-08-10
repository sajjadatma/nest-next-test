import { Injectable } from '@nestjs/common';
import { type LlmChatRequest, type LlmProvider, type ProviderCitation, type ProviderResponse } from './llm-provider.interface';

@Injectable()
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';

  async completeChat(request: LlmChatRequest): Promise<ProviderResponse> {
    if (!request.toolResults) return this.initialResponse(request);
    return this.finalResponse(request);
  }

  private initialResponse(request: LlmChatRequest): ProviderResponse {
    if (request.intent.intent === 'compare') {
      const productIds = request.context.referenceProductIds ?? [];
      return productIds.length >= 2
        ? { type: 'tool_call', toolCall: { name: 'compare_products', input: { productIds } } }
        : { type: 'final', response: { kind: 'quick_replies', text: 'Which products would you like to compare?', options: [] } };
    }
    if (request.intent.intent === 'product_search' || request.intent.intent === 'refine_search') {
      return { type: 'tool_call', toolCall: { name: 'search_products', input: {} } };
    }
    return { type: 'final', response: { kind: 'quick_replies', text: 'Please tell me the product type or category you need.', options: [] } };
  }

  private finalResponse(request: LlmChatRequest): ProviderResponse {
    const toolResult = request.toolResults?.[0];
    if (!toolResult || !isSuccess(toolResult.result)) return { type: 'final', response: { kind: 'text', text: 'I could not verify that information safely.' } };
    if (toolResult.tool === 'search_products' && isSearchData(toolResult.result.data)) {
      const items = toolResult.result.data.items.map((item) => ({
        productId: stringValue(item.productId), variantId: stringValue(item.variantId), title: stringValue(item.title), priceMinor: numberValue(item.priceMinor), currency: stringValue(item.currency),
        availability: item.availability === 'IN_STOCK' ? 'in_stock' as const : 'out_of_stock' as const,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}), productUrl: item.productUrl,
        attributes: stringAttributes(item.canonicalAttributes),
      }));
      const citations = toolResult.result.data.items.flatMap((item): ProviderCitation[] => [
        { kind: 'price', value: numberValue(item.priceMinor), sourceTool: 'search_products' },
        { kind: 'availability', value: stringValue(item.availability), sourceTool: 'search_products' },
      ]);
      return { type: 'final', response: { kind: 'product_carousel', items }, citations };
    }
    return { type: 'final', response: { kind: 'text', text: 'Here is the verified information from our catalog.' } };
  }
}

function isSuccess(value: unknown): value is { ok: true; data: unknown } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true;
}

function isSearchData(value: unknown): value is { items: Array<Record<string, unknown>> } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items);
}

function stringAttributes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, attribute]) => typeof attribute === 'string')) as Record<string, string>;
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : -1; }
