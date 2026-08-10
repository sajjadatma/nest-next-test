import { type StructuredIntent } from '../contracts/intent.contracts';

export const AGENT_TOOL_NAMES = [
  'search_products', 'get_product', 'check_inventory', 'get_price', 'get_product_images', 'compare_products', 'get_shipping_estimate', 'get_customer_context',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type ProviderCitation = {
  kind: 'price' | 'stock' | 'shipping' | 'availability';
  value: string | number;
  sourceTool: AgentToolName;
};

export type ProviderToolCall = { name: string; input: Record<string, unknown> };

export type ProviderResponse =
  | { type: 'tool_call'; toolCall: ProviderToolCall }
  | { type: 'final'; response: unknown; citations?: ProviderCitation[] };

export type LlmChatRequest = {
  text: string;
  intent: StructuredIntent;
  tools: readonly AgentToolName[];
  context: { merchantId: string; conversationId?: string; referenceProductIds?: string[] };
  toolResults?: Array<{ tool: AgentToolName; result: unknown }>;
};

export interface LlmProvider {
  readonly name: string;
  completeChat(request: LlmChatRequest): Promise<ProviderResponse>;
}
