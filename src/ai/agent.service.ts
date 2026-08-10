import { Injectable } from '@nestjs/common';
import { CommerceToolsService } from '../commerce/commerce-tools.service';
import { type StructuredIntent } from './contracts/intent.contracts';
import { type AgentToolName, type ProviderCitation, type ProviderResponse } from './gateway/llm-provider.interface';
import { LlmGatewayService } from './gateway/llm-gateway.service';
import { IntentParserService } from './intent-parser.service';
import { AgentPolicyService } from './policy/agent-policy.service';
import { ResponseValidatorService } from './validation/response-validator.service';

export type CommerceResponse =
  | { kind: 'text'; text: string }
  | { kind: 'product_carousel'; intro?: string; items: Array<Record<string, unknown>> }
  | { kind: 'quick_replies'; text: string; options: Array<{ id: string; label: string }> }
  | { kind: 'checkout_link'; text: string; url: string }
  | { kind: 'human_handoff'; text: string };

export type DemandOutcome = {
  merchantId: string;
  conversationId?: string;
  intent: StructuredIntent['intent'];
  kind: 'UNKNOWN' | 'MATCHED' | 'NO_MATCH' | 'OUT_OF_STOCK' | 'PRICE_TOO_HIGH' | 'VARIANT_UNAVAILABLE' | 'HANDED_OFF';
  confidence: number;
  reason?: string;
};

export type AgentRequest = {
  merchantId: string;
  conversationId?: string;
  text: string;
  intent?: StructuredIntent;
  correlationId?: string;
};

export type AgentResult = { response: CommerceResponse; outcome: DemandOutcome };

@Injectable()
export class AgentService {
  constructor(
    private readonly parser: IntentParserService,
    private readonly gateway: LlmGatewayService,
    private readonly policy: AgentPolicyService,
    private readonly validator: ResponseValidatorService,
    private readonly tools: CommerceToolsService,
  ) {}

  async respond(request: AgentRequest): Promise<AgentResult> {
    const intent = request.intent ?? this.parseIntent(request.text);
    const decision = this.policy.decide(intent, request.text);
    if (decision.action === 'handoff') return this.handoff(request, intent, decision.reason);
    if (decision.action === 'clarify') return this.clarify(request, intent);

    const initial = await this.gateway.completeChat({
      text: request.text, intent, tools: [], context: { merchantId: request.merchantId, conversationId: request.conversationId, referenceProductIds: intent.referenceProductIds },
    });
    if (initial.type !== 'tool_call') return this.validateFinal(initial, request, intent, []);
    if (!this.policy.allowTool(initial.toolCall.name)) return this.handoff(request, intent, 'TOOL_NOT_ALLOWED');

    const tool = initial.toolCall.name;
    const toolResult = await this.executeTool(tool, initial.toolCall.input, request, intent);
    if (!toolResult.ok) return this.safeToolFailure(request, intent, toolResult.code);

    const final = await this.gateway.completeChat({
      text: request.text, intent, tools: [tool], context: { merchantId: request.merchantId, conversationId: request.conversationId, referenceProductIds: intent.referenceProductIds },
      toolResults: [{ tool, result: toolResult }],
    });
    return this.validateFinal(final, request, intent, [{ tool, result: toolResult }]);
  }

  private parseIntent(text: string): StructuredIntent {
    const parsed = this.parser.parse(text);
    return parsed.intent === 'other' && text.trim().length > 0
      ? { intent: 'product_search', confidence: 0.8, missingInformation: [], attributes: parsed.attributes, size: parsed.size }
      : parsed;
  }

  private async executeTool(tool: AgentToolName, input: Record<string, unknown>, request: AgentRequest, intent: StructuredIntent): Promise<any> {
    const context = { correlationId: request.correlationId };
    switch (tool) {
      case 'search_products':
        return this.tools.searchProducts({ merchantId: request.merchantId, query: intent.attributes?.color ?? (intent.attributes || intent.size ? undefined : request.text), category: intent.category, attributes: withoutColor(intent.attributes), size: intent.size, budgetMin: intent.budgetMin, budgetMax: intent.budgetMax, currency: intent.currency, ...input }, context);
      case 'compare_products':
        return this.tools.compareProducts({ merchantId: request.merchantId, productIds: intent.referenceProductIds, ...input }, context);
      case 'get_product': return this.tools.getProduct({ merchantId: request.merchantId, ...input }, context);
      case 'check_inventory': return this.tools.checkInventory({ merchantId: request.merchantId, ...input }, context);
      case 'get_price': return this.tools.getPrice({ merchantId: request.merchantId, ...input }, context);
      case 'get_product_images': return this.tools.getProductImages({ merchantId: request.merchantId, ...input }, context);
      case 'get_shipping_estimate': return this.tools.getShippingEstimate({ merchantId: request.merchantId, ...input }, context);
      case 'get_customer_context': return this.tools.getCustomerContext({ merchantId: request.merchantId, ...input }, context);
    }
  }

  private validateFinal(final: ProviderResponse, request: AgentRequest, intent: StructuredIntent, readbacks: Array<{ tool: AgentToolName; result: unknown }>): AgentResult {
    if (final.type !== 'final') return this.handoff(request, intent, 'MALFORMED_PROVIDER_RESPONSE');
    const candidate = this.responseCandidate(final);
    const validation = this.validator.validate(candidate, readbacks);
    if (!validation.ok) return this.handoff(request, intent, 'RESPONSE_VALIDATION_FAILED');
    return { response: candidate as CommerceResponse, outcome: this.outcome(request, intent, readbacks) };
  }

  private responseCandidate(final: Extract<ProviderResponse, { type: 'final' }>): { kind: string; text?: string; items?: unknown; citations?: ProviderCitation[] } {
    const response = final.response;
    return response && typeof response === 'object' && !Array.isArray(response)
      ? { ...(response as { kind: string; text?: string; items?: unknown }), citations: final.citations }
      : { kind: 'invalid' };
  }

  private safeToolFailure(request: AgentRequest, intent: StructuredIntent, code: string): AgentResult {
    const kind = code === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : code === 'PRICE_UNVERIFIABLE' ? 'PRICE_TOO_HIGH' : 'UNKNOWN';
    return { response: { kind: 'text', text: 'I could not verify that information safely.' }, outcome: this.outcome(request, intent, [], kind, code) };
  }

  private clarify(request: AgentRequest, intent: StructuredIntent): AgentResult {
    return { response: { kind: 'quick_replies', text: 'Please tell me the product type or category you need.', options: [] }, outcome: this.outcome(request, intent, []) };
  }

  private handoff(request: AgentRequest, intent: StructuredIntent, reason: string): AgentResult {
    return { response: { kind: 'human_handoff', text: 'I will connect you with a human support specialist.' }, outcome: this.outcome(request, intent, [], 'HANDED_OFF', reason) };
  }

  private outcome(request: AgentRequest, intent: StructuredIntent, readbacks: Array<{ tool: AgentToolName; result: unknown }>, defaultKind: DemandOutcome['kind'] = 'UNKNOWN', reason?: string): DemandOutcome {
    const search = readbacks.find(({ tool }) => tool === 'search_products')?.result as { data?: { matched?: boolean; reason?: string; items?: Array<{ availability?: string; priceMinor?: number }> } } | undefined;
    let kind = defaultKind;
    if (search?.data?.matched === true) kind = 'MATCHED';
    if (search?.data?.matched === false) kind = search.data.reason === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'NO_MATCH';
    if (search?.data?.items?.some((item) => item.availability === 'OUT_OF_STOCK')) kind = 'OUT_OF_STOCK';
    if (intent.budgetMax !== undefined && search?.data?.items?.length && search.data.items.every((item) => (item.priceMinor ?? 0) > intent.budgetMax!)) kind = 'PRICE_TOO_HIGH';
    return { merchantId: request.merchantId, ...(request.conversationId ? { conversationId: request.conversationId } : {}), intent: intent.intent, kind, confidence: intent.confidence, ...(reason ? { reason } : {}) };
  }
}

function withoutColor(attributes: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!attributes?.color) return attributes;
  const remaining = { ...attributes };
  delete remaining.color;
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}
