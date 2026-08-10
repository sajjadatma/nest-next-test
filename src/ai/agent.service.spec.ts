import { AgentService, type AgentRequest } from './agent.service';
import { FakeLlmProvider } from './gateway/fake-llm-provider';
import { LlmGatewayService } from './gateway/llm-gateway.service';
import { IntentParserService } from './intent-parser.service';
import { AgentPolicyService } from './policy/agent-policy.service';
import { ResponseValidatorService } from './validation/response-validator.service';

const at = '2026-08-10T12:00:00.000Z';
const searchResult = {
  ok: true as const,
  at,
  data: {
    matched: true,
    items: [{
      productId: 'product-1', variantId: 'variant-1', slug: 'white-runner', title: 'کفش سفید',
      category: { name: 'Shoes', slug: 'shoes' }, priceMinor: 900, currency: 'IRR', availability: 'IN_STOCK' as const,
      imageUrl: 'https://example.test/shoe.jpg', productUrl: '/shop/products/white-runner', canonicalAttributes: { color: 'white' },
    }],
  },
};

const tools = {
  searchProducts: vi.fn().mockResolvedValue(searchResult),
  compareProducts: vi.fn(),
  getProduct: vi.fn(),
  checkInventory: vi.fn(),
  getPrice: vi.fn(),
  getProductImages: vi.fn(),
  getShippingEstimate: vi.fn(),
  getCustomerContext: vi.fn(),
};

const request = (overrides: Partial<AgentRequest> = {}): AgentRequest => ({
  merchantId: 'merchant-1',
  conversationId: 'conversation-1',
  text: 'کفش سفید سایز ۴۲',
  intent: { intent: 'product_search', attributes: { color: 'white' }, size: '42', confidence: 0.99, missingInformation: [] },
  ...overrides,
});

describe('AgentService', () => {
  let gateway: LlmGatewayService;
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new LlmGatewayService(new FakeLlmProvider());
    service = new AgentService(new IntentParserService(), gateway, new AgentPolicyService(), new ResponseValidatorService(), tools as never);
  });

  it('returns deterministic CommerceResponses for Persian search, useful clarification, and exact or partial matches', async () => {
    const search = await service.respond(request());
    const clarification = await service.respond(request({ intent: { intent: 'other', confidence: 0.8, missingInformation: ['category'] } }));
    const repeated = await service.respond(request());

    expect(search).toEqual(repeated);
    expect(search.response).toMatchObject({ kind: 'product_carousel', items: [{ title: 'کفش سفید' }] });
    expect(clarification.response).toMatchObject({ kind: 'quick_replies' });
  });

  it.each([
    ['no match', { matched: false, reason: 'NO_MATCH', items: [] }, request(), 'NO_MATCH'],
    ['out of stock', { matched: true, items: [{ ...searchResult.data.items[0], availability: 'OUT_OF_STOCK' }] }, request(), 'OUT_OF_STOCK'],
    ['price too high', searchResult.data, request({ intent: { intent: 'product_search', budgetMax: 500, confidence: 0.99, missingInformation: [] } }), 'PRICE_TOO_HIGH'],
  ])('emits a structured %s outcome from verified tool state', async (_name, data, fixture, expectedKind) => {
    vi.mocked(tools.searchProducts).mockResolvedValueOnce({ ok: true, at, data } as never);

    const result = await service.respond(fixture);

    expect(result.response.kind).toBe('product_carousel');
    expect(result.outcome).toMatchObject({ kind: expectedKind, merchantId: 'merchant-1' });
  });

  it('selects only allowed tools and returns catalog cards built from verified tool data', async () => {
    const result = await service.respond(request());

    expect(tools.searchProducts).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'merchant-1', query: 'white', size: '42', attributes: undefined }), expect.any(Object));
    expect(result.response).toMatchObject({ kind: 'product_carousel', items: [{ productId: 'product-1', variantId: 'variant-1', priceMinor: 900, currency: 'IRR', availability: 'in_stock' }] });
    expect(result.outcome).toMatchObject({ kind: 'MATCHED', intent: 'product_search' });
  });

  it('fails safe without executing a non-allow-listed tool requested by a provider', async () => {
    gateway.register({
      name: 'adversarial',
      completeChat: vi.fn().mockResolvedValue({ type: 'tool_call', toolCall: { name: 'delete_catalog', input: {} } }),
    });
    gateway.use('adversarial');

    const result = await service.respond(request());

    expect(result.response).toMatchObject({ kind: 'human_handoff' });
    expect(result.outcome).toMatchObject({ kind: 'HANDED_OFF', reason: 'TOOL_NOT_ALLOWED' });
    expect(tools.searchProducts).not.toHaveBeenCalled();
  });

  it.each(['refund please', 'payment failed', 'this is terrible', 'need a policy exception'])('hands off %s before any autonomous commerce mutation', async (text) => {
    const result = await service.respond(request({ text }));

    expect(result.response).toMatchObject({ kind: 'human_handoff' });
    expect(result.outcome).toMatchObject({ kind: 'HANDED_OFF' });
    expect(tools.searchProducts).not.toHaveBeenCalled();
  });

  it('rejects a fabricated price even when a provider supplies a citation', async () => {
    gateway.register({
      name: 'fabricator',
      completeChat: vi.fn()
        .mockResolvedValueOnce({ type: 'tool_call', toolCall: { name: 'search_products', input: {} } })
        .mockResolvedValueOnce({ type: 'final', response: { kind: 'text', text: 'The price is 999 IRR.' }, citations: [{ kind: 'price', value: 999, sourceTool: 'search_products' }] }),
    });
    gateway.use('fabricator');

    const result = await service.respond(request());

    expect(result.response).toMatchObject({ kind: 'human_handoff' });
    expect(result.outcome).toMatchObject({ kind: 'HANDED_OFF', reason: 'RESPONSE_VALIDATION_FAILED' });
  });

  it('rejects fabricated stock and shipping claims and malformed provider output', async () => {
    expect(new ResponseValidatorService().validate(
      { kind: 'text', text: 'Only 99 remain and shipping costs 500.', citations: [{ kind: 'stock', value: 99, sourceTool: 'check_inventory' }, { kind: 'shipping', value: 500, sourceTool: 'get_shipping_estimate' }] },
      [{ tool: 'check_inventory', result: { ok: true, at, data: { stockQty: 2 } } }, { tool: 'get_shipping_estimate', result: { ok: true, at, data: { methods: [{ priceMinor: 0 }] } } }],
    )).toMatchObject({ ok: false, code: 'FABRICATED_FACT' });
    expect(new ResponseValidatorService().validate({ kind: 'text', text: 'Price is 900.' }, [
      { tool: 'get_price', result: { ok: true, at, data: { priceMinor: 900 } } },
    ])).toMatchObject({ ok: false, code: 'MISSING_CITATION' });
    expect(new ResponseValidatorService().validate({ kind: 'not_a_response' }, [])).toMatchObject({ ok: false, code: 'MALFORMED_RESPONSE' });
  });
});
