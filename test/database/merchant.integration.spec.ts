import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_MERCHANT_ID, DEFAULT_MERCHANT_SLUG } from '../../src/merchant/merchant.constants';
import { MerchantService } from '../../src/merchant/merchant.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Merchant foundation database migration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;
  let migrationWorkspace: string;
  const repositoryRoot = process.cwd();
  const migrationName = '20260810120000_merchant_foundation';
  const legacyCategoryId = 'legacy-category';
  const legacyProductId = 'legacy-product';
  const legacyUserId = 'legacy-user';
  const legacyOrderId = 'legacy-order';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    databaseUrl = container.getConnectionUri();
    migrationWorkspace = mkdtempSync(join(tmpdir(), 'merchant-migration-'));
    const temporaryPrismaDirectory = join(migrationWorkspace, 'prisma');

    mkdirSync(temporaryPrismaDirectory);
    cpSync(join(repositoryRoot, 'prisma', 'schema.prisma'), join(temporaryPrismaDirectory, 'schema.prisma'));
    cpSync(join(repositoryRoot, 'prisma', 'migrations'), join(temporaryPrismaDirectory, 'migrations'), { recursive: true });
    // Rehearse the pre-B01 legacy baseline: exclude the merchant foundation
    // migration AND every later dependent migration, so the temporary
    // workspace replays only migrations that predate B01.
    const temporaryMigrationsDirectory = join(temporaryPrismaDirectory, 'migrations');
    for (const entry of readdirSync(temporaryMigrationsDirectory)) {
      if (entry >= migrationName) rmSync(join(temporaryMigrationsDirectory, entry), { recursive: true, force: true });
    }

    execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', join(temporaryPrismaDirectory, 'schema.prisma')], {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const legacyPrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await legacyPrisma.$executeRaw`
      INSERT INTO "Category" ("id", "name", "slug", "position", "createdAt", "updatedAt")
      VALUES (${legacyCategoryId}, 'Legacy category', 'legacy-category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$executeRaw`
      INSERT INTO "Product" ("id", "name", "slug", "description", "priceMinor", "currency", "stockQty", "lowStockThreshold", "categoryId", "createdAt", "updatedAt")
      VALUES (${legacyProductId}, 'Legacy product', 'legacy-product', 'Preserved through migration', 1500, 'USD', 7, 5, ${legacyCategoryId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$executeRaw`
      INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
      VALUES (${legacyUserId}, 'legacy@example.com', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$executeRaw`
      INSERT INTO "Order" ("id", "number", "email", "phone", "subtotalMinor", "totalMinor", "shippingAddress", "idempotencyKey", "confirmationTokenHash", "createdAt", "updatedAt")
      VALUES (${legacyOrderId}, 'ORD-LEGACY-1', 'legacy@example.com', '555-0100', 1500, 1500, '{"line1":"Legacy"}'::jsonb, 'legacy-idempotency-key', 'legacy-confirmation-token', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$disconnect();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    if (migrationWorkspace && existsSync(migrationWorkspace)) rmSync(migrationWorkspace, { recursive: true, force: true });
  });

  it('backfills legacy products to the default merchant while preserving legacy rows', async () => {
    await expect(prisma.merchant.count({ where: { id: DEFAULT_MERCHANT_ID, slug: DEFAULT_MERCHANT_SLUG } })).resolves.toBe(1);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: legacyProductId } })).resolves.toMatchObject({ merchantId: DEFAULT_MERCHANT_ID, name: 'Legacy product' });
    await expect(prisma.user.count({ where: { id: legacyUserId } })).resolves.toBe(1);
    await expect(prisma.order.count({ where: { id: legacyOrderId } })).resolves.toBe(1);
  });

  it('enforces merchant and membership uniqueness constraints', async () => {
    const user = await prisma.user.create({ data: { email: 'membership@example.com', passwordHash: 'hash' } });
    const merchant = await prisma.merchant.create({ data: { slug: 'second-merchant', name: 'Second Merchant' } });
    await prisma.merchantMembership.create({ data: { merchantId: merchant.id, userId: user.id } });

    await expect(prisma.merchant.create({ data: { slug: 'second-merchant', name: 'Duplicate merchant' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.merchantMembership.create({ data: { merchantId: merchant.id, userId: user.id } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('idempotently ensures the default merchant and scopes reads to one merchant', async () => {
    const service = new MerchantService(prisma as unknown as PrismaService);
    const defaultMerchant = await service.ensureDefaultMerchant();
    const secondMerchant = await prisma.merchant.create({ data: { slug: 'scoped-merchant', name: 'Scoped Merchant' } });
    const member = await prisma.user.create({ data: { email: 'scoped-member@example.com', passwordHash: 'hash' } });
    await prisma.merchantMembership.create({ data: { merchantId: secondMerchant.id, userId: member.id } });
    await prisma.product.create({
      data: {
        merchantId: secondMerchant.id,
        categoryId: legacyCategoryId,
        name: 'Scoped product',
        slug: 'scoped-product',
        description: 'Visible only to its merchant',
        priceMinor: 2000,
      },
    });

    await expect(service.ensureDefaultMerchant()).resolves.toMatchObject({ id: defaultMerchant.id, slug: DEFAULT_MERCHANT_SLUG });
    await expect(prisma.merchant.count({ where: { slug: DEFAULT_MERCHANT_SLUG } })).resolves.toBe(1);
    await expect(service.isMember(member.id, secondMerchant.id)).resolves.toBe(true);
    await expect(service.isMember(member.id, defaultMerchant.id)).resolves.toBe(false);
    await expect(service.productsScoped(defaultMerchant.id)).resolves.toHaveLength(1);
    await expect(service.productsScoped(secondMerchant.id)).resolves.toMatchObject([{ slug: 'scoped-product', merchantId: secondMerchant.id }]);
  });

  it('assigns the default merchant to products created by existing writers', async () => {
    await expect(prisma.product.create({
      data: {
        categoryId: legacyCategoryId,
        name: 'Default scoped product',
        slug: 'default-scoped-product',
        description: 'Maintains existing product writer compatibility',
        priceMinor: 2500,
      },
    })).resolves.toMatchObject({ merchantId: DEFAULT_MERCHANT_ID });
  });

  it('records the expected migration constraint and index names', async () => {
    const [productMerchantForeignKey] = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'Product_merchantId_fkey'
    `;
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('Merchant_slug_key', 'MerchantMembership_merchantId_userId_key')
    `;

    expect(productMerchantForeignKey).toEqual({ conname: 'Product_merchantId_fkey' });
    expect(indexes.map(({ indexname }) => indexname).sort()).toEqual(['MerchantMembership_merchantId_userId_key', 'Merchant_slug_key']);
  });
});
