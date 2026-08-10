import { Injectable } from '@nestjs/common';
import { type AgentToolName, type ProviderCitation } from '../gateway/llm-provider.interface';

type ToolReadback = { tool: AgentToolName; result: unknown };
type Candidate = { kind: string; text?: string; items?: unknown; citations?: ProviderCitation[] };
export type ResponseValidation = { ok: true } | { ok: false; code: 'MALFORMED_RESPONSE' | 'MISSING_CITATION' | 'FABRICATED_FACT' };

@Injectable()
export class ResponseValidatorService {
  validate(candidate: Candidate, toolReadbacks: ToolReadback[]): ResponseValidation {
    if (!this.isCommerceResponse(candidate)) return { ok: false, code: 'MALFORMED_RESPONSE' };
    if (!this.citationsAreGrounded(candidate.citations ?? [], toolReadbacks)) return { ok: false, code: 'FABRICATED_FACT' };
    if (this.claimsCommercialFact(candidate.text) && !(candidate.citations?.length)) return { ok: false, code: 'MISSING_CITATION' };
    if (candidate.kind === 'product_carousel' && !this.cardsAreGrounded(candidate.items, toolReadbacks)) return { ok: false, code: 'FABRICATED_FACT' };
    return { ok: true };
  }

  private isCommerceResponse(value: Candidate): boolean {
    if (!['text', 'product_carousel', 'quick_replies', 'checkout_link', 'human_handoff'].includes(value.kind)) return false;
    if (value.kind === 'product_carousel') return Array.isArray(value.items);
    return typeof value.text === 'string';
  }

  private citationsAreGrounded(citations: ProviderCitation[], readbacks: ToolReadback[]): boolean {
    return citations.every((citation) => {
      const source = readbacks.find((readback) => readback.tool === citation.sourceTool);
      return Boolean(source && this.factValues(citation.kind, source.result).some((value) => value === citation.value));
    });
  }

  private cardsAreGrounded(items: unknown, readbacks: ToolReadback[]): boolean {
    if (!Array.isArray(items)) return false;
    const cards = readbacks.flatMap((readback) => this.productCards(readback.result));
    return items.every((item) => typeof item === 'object' && item !== null && cards.some((card) => this.cardMatches(item as Record<string, unknown>, card)));
  }

  private cardMatches(item: Record<string, unknown>, card: Record<string, unknown>): boolean {
    return item.productId === card.productId && item.variantId === card.variantId && item.title === card.title
      && item.priceMinor === card.priceMinor && item.currency === card.currency
      && item.availability === (card.availability === 'IN_STOCK' ? 'in_stock' : 'out_of_stock');
  }

  private productCards(result: unknown): Array<Record<string, unknown>> {
    const data = this.data(result);
    if (!data) return [];
    const items = data.items;
    return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
  }

  private factValues(kind: ProviderCitation['kind'], result: unknown): Array<string | number> {
    const data = this.data(result);
    if (!data) return [];
    if (kind === 'price') return this.valuesFor(data, 'priceMinor');
    if (kind === 'stock') return [...this.valuesFor(data, 'stockQty'), ...this.valuesFor(data, 'availability')];
    if (kind === 'availability') return this.valuesFor(data, 'availability');
    return this.valuesFor(data, 'priceMinor', 'methods');
  }

  private valuesFor(value: unknown, key: string, nestedKey?: string): Array<string | number> {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const direct = typeof record[key] === 'string' || typeof record[key] === 'number' ? [record[key] as string | number] : [];
    const nested = nestedKey && Array.isArray(record[nestedKey]) ? record[nestedKey].flatMap((entry) => this.valuesFor(entry, key)) : [];
    const items = Array.isArray(record.items) ? record.items.flatMap((entry) => this.valuesFor(entry, key)) : [];
    return [...direct, ...nested, ...items];
  }

  private data(result: unknown): Record<string, unknown> | undefined {
    if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true) return undefined;
    const data = (result as { data?: unknown }).data;
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  }

  private claimsCommercialFact(text: string | undefined): boolean {
    return typeof text === 'string' && /(?:price|stock|shipping|availability|قیمت|موجودی|ارسال)\s*(?:is|:)?\s*\d/iu.test(text);
  }
}
