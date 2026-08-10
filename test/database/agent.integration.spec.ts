import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { AgentService } from '../../src/ai/agent.service';
import { FakeLlmProvider } from '../../src/ai/gateway/fake-llm-provider';
import { LlmGatewayService } from '../../src/ai/gateway/llm-gateway.service';
import { IntentParserService } from '../../src/ai/intent-parser.service';
import { AgentPolicyService } from '../../src/ai/policy/agent-policy.service';
import { ResponseValidatorService } from '../../src/ai/validation/response-validator.service';
import { AuditService } from '../../src/audit/audit.service';
import { CommerceToolsService } from '../../src/commerce/commerce-tools.service';
import { ShippingReadRepository } from '../../src/commerce/shipping/shipping-read.repository';
import { ShippingReadService } from '../../src/commerce/shipping/shipping-read.service';
import { VariantReadService } from '../../src/commerce/variants/variant-read.service';
import { VariantRepository } from '../../src/commerce/variants/variant.repository';
import { ConversationService } from '../../src/conversations/conversation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SystemLogService } from '../../src/system-logs/system-log.service';

describe('AgentService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let agent: AgentService;
  let merchantId: string;
  let firstProductId: string;
  let secondProductId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const merchant = await prisma.merchant.create({ data: { slug: 'agent-integration', name: 'Agent integration' } });
    merchantId = merchant.id;
    const category = await prisma.category.create({ data: { slug: 'agent-shoes', name: 'Shoes' } });
    const first = await prisma.product.create({ data: { merchantId, name: 'کفش سفید', slug: 'agent-white-shoe', description: 'White running shoe', categoryId: category.id, priceMinor: 900, stockQty: 3 } });
    const second = await prisma.product.create({ data: { merchantId, name: 'کفش مشکی', slug: 'agent-black-shoe', description: 'Black running shoe', categoryId: category.id, priceMinor: 1200, stockQty: 2 } });
    const [firstVariant, secondVariant] = await Promise.all([
      prisma.productVariant.create({ data: { productId: first.id, sku: 'AGENT-FA-1', color: 'White', size: '42', priceMinor: 900, currency: 'IRR', stockQty: 3, isDefault: true } }),
      prisma.productVariant.create({ data: { productId: second.id, sku: 'AGENT-EN-1', color: 'Black', size: '42', priceMinor: 1200, currency: 'IRR', stockQty: 2, isDefault: true } }),
    ]);
    await Promise.all([
      prisma.product.update({ where: { id: first.id }, data: { defaultVariantId: firstVariant.id } }),
      prisma.product.update({ where: { id: second.id }, data: { defaultVariantId: secondVariant.id } }),
    ]);
    firstProductId = first.id;
    secondProductId = second.id;
    const prismaService = prisma as unknown as PrismaService;
    const tools = new CommerceToolsService(
      new VariantReadService(new VariantRepository(prismaService)),
      new ShippingReadService(new ShippingReadRepository(prismaService)),
      new ConversationService(prismaService),
      new AuditService(prismaService, new SystemLogService(prismaService)),
    );
    agent = new AgentService(new IntentParserService(), new LlmGatewayService(new FakeLlmProvider()), new AgentPolicyService(), new ResponseValidatorService(), tools);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('returns a Persian search carousel whose price and availability read back from the real scoped catalog', async () => {
    const result = await agent.respond({
      merchantId, conversationId: 'agent-conversation-1', text: 'کفش سفید سایز ۴۲',
      intent: { intent: 'product_search', attributes: { color: 'white' }, size: '42', confidence: 0.99, missingInformation: [] },
      correlationId: 'agent-search',
    });

    expect(result.response).toMatchObject({ kind: 'product_carousel', items: [{ productId: firstProductId, priceMinor: 900, currency: 'IRR', availability: 'in_stock' }] });
    expect(result.outcome).toMatchObject({ kind: 'MATCHED', merchantId, conversationId: 'agent-conversation-1' });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.search_products', metadata: { path: ['correlationId'], equals: 'agent-search' } } })).resolves.toBe(1);
  });

  it('uses stable product references for a comparison follow-up without querying another merchant', async () => {
    const result = await agent.respond({
      merchantId, conversationId: 'agent-conversation-1', text: 'compare second and third',
      intent: { intent: 'compare', referenceProductIds: [firstProductId, secondProductId], confidence: 0.99, missingInformation: [] },
    });

    expect(result.response).toMatchObject({ kind: 'text' });
    expect(result.outcome).toMatchObject({ merchantId, intent: 'compare' });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.compare_products' } })).resolves.toBe(1);
  });

  it('hands off a refund request before any autonomous commerce tool execution', async () => {
    const before = await prisma.auditLog.count({ where: { action: { startsWith: 'commerce.' } } });
    const result = await agent.respond({ merchantId, conversationId: 'agent-conversation-1', text: 'I need a refund', intent: { intent: 'product_search', confidence: 1, missingInformation: [] } });

    expect(result.response).toMatchObject({ kind: 'human_handoff' });
    expect(result.outcome).toMatchObject({ kind: 'HANDED_OFF', reason: 'HANDOFF_REQUIRED' });
    await expect(prisma.auditLog.count({ where: { action: { startsWith: 'commerce.' } } })).resolves.toBe(before);
  });
});
