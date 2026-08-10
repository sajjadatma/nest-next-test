import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { VariantRepository } from '../../src/commerce/variants/variant.repository';
import { VariantReadService } from '../../src/commerce/variants/variant-read.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const migrationName = '20260810130000_product_variants';
const legacyCategoryId = 'variant-legacy-category';
const legacyProductId = 'variant-legacy-product';
const legacyProductSlug = 'variant-legacy-product';
const defaultMerchantId = 'cm1v1defaultmerchant0000000';

describe('ProductVariant database migration and read model', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let migrationWorkspace: string;
  let readService: VariantReadService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    const repositoryRoot = process.cwd();
    migrationWorkspace = mkdtempSync(join(tmpdir(), 'variant-migration-'));
    const temporaryPrismaDirectory = join(migrationWorkspace, 'prisma');

    mkdirSync(temporaryPrismaDirectory);
    cpSync(join(repositoryRoot, 'prisma', 'schema.prisma'), join(temporaryPrismaDirectory, 'schema.prisma'));
    cpSync(join(repositoryRoot, 'prisma', 'migrations'), join(temporaryPrismaDirectory, 'migrations'), { recursive: true });
    // Rehearse the pre-variant baseline: exclude the product-variants
    // migration AND every later dependent migration, so the temporary
    // workspace replays only migrations that predate B02.
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
      VALUES (${legacyCategoryId}, 'Variant legacy category', 'variant-legacy-category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$executeRaw`
      INSERT INTO "Product" ("id", "merchantId", "name", "slug", "description", "priceMinor", "currency", "stockQty", "lowStockThreshold", "categoryId", "createdAt", "updatedAt")
      VALUES (${legacyProductId}, ${defaultMerchantId}, 'Variant legacy product', ${legacyProductSlug}, 'Preserved through variant migration', 1500, 'USD', 7, 5, ${legacyCategoryId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await legacyPrisma.$disconnect();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    readService = new VariantReadService(new VariantRepository(prisma as unknown as PrismaService));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    if (migrationWorkspace && existsSync(migrationWorkspace)) rmSync(migrationWorkspace, { recursive: true, force: true });
  });

  it('backfills exactly one default variant per existing product with legacy commerce values', async () => {
    const [productCount, variantCount, defaultVariantCount, legacyProduct] = await Promise.all([
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.productVariant.count({ where: { isDefault: true } }),
      prisma.product.findUniqueOrThrow({ where: { id: legacyProductId }, include: { defaultVariant: true, variants: true } }),
    ]);

    expect(productCount).toBe(1);
    expect(variantCount).toBe(productCount);
    expect(defaultVariantCount).toBe(productCount);
    expect(legacyProduct.defaultVariantId).toBe(legacyProduct.defaultVariant?.id);
    expect(legacyProduct.variants).toHaveLength(1);
    expect(legacyProduct.defaultVariant).toMatchObject({
      productId: legacyProductId,
      sku: `legacy-${legacyProductSlug}`,
      priceMinor: 1500,
      currency: 'USD',
      stockQty: 7,
      isDefault: true,
    });
  });

  it('enforces unique SKUs and keeps the existing guarded stock reservation semantics', async () => {
    const defaultVariant = await prisma.productVariant.findFirstOrThrow({ where: { productId: legacyProductId, isDefault: true } });
    await expect(prisma.productVariant.create({
      data: { productId: legacyProductId, sku: defaultVariant.sku, priceMinor: 1500 },
    })).rejects.toMatchObject({ code: 'P2002' });

    await prisma.product.update({ where: { id: legacyProductId }, data: { stockQty: 1 } });
    const reservations = await Promise.all([
      prisma.product.updateMany({ where: { id: legacyProductId, stockQty: { gte: 1 } }, data: { stockQty: { decrement: 1 } } }),
      prisma.product.updateMany({ where: { id: legacyProductId, stockQty: { gte: 1 } }, data: { stockQty: { decrement: 1 } } }),
    ]);
    expect(reservations.map(({ count }) => count).sort()).toEqual([0, 1]);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: legacyProductId }, select: { stockQty: true } })).resolves.toEqual({ stockQty: 0 });
  });

  it('matches color, size, and canonical attributes deterministically and distinguishes no-match from out-of-stock', async () => {
    await prisma.productVariant.createMany({
      data: [
        { productId: legacyProductId, sku: 'variant-blue-large-wool', color: 'Ocean Blue', size: 'Large', otherAttributes: { material: 'Wool', fit: 'Regular' }, priceMinor: 2200, currency: 'USD', stockQty: 3 },
        { productId: legacyProductId, sku: 'variant-blue-small-cotton', color: 'Ocean Blue', size: 'Small', otherAttributes: { material: 'Cotton' }, priceMinor: 1800, currency: 'USD', stockQty: 0 },
      ],
    });

    await expect(readService.search({ merchantId: defaultMerchantId, color: 'blue', size: 'larg', attributes: { material: 'wool', fit: 'reg' } })).resolves.toMatchObject({
      matched: true,
      availability: 'IN_STOCK',
      items: [{ sku: 'variant-blue-large-wool', availability: 'IN_STOCK', canonicalAttributes: { material: 'Wool', fit: 'Regular' } }],
    });
    await expect(readService.search({ merchantId: defaultMerchantId, color: 'green' })).resolves.toEqual({ matched: false, availability: null, items: [] });
    await expect(readService.search({ merchantId: defaultMerchantId, color: 'blue', size: 'small' })).resolves.toMatchObject({
      matched: true,
      availability: 'OUT_OF_STOCK',
      items: [{ sku: 'variant-blue-small-cotton', availability: 'OUT_OF_STOCK' }],
    });
  });

  it('reads current variant price and stock at call time', async () => {
    const before = await readService.search({ merchantId: defaultMerchantId, color: 'blue', size: 'large' });
    const variantId = before.items[0].variantId;
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceMinor: 2450, stockQty: 0 } });

    await expect(readService.search({ merchantId: defaultMerchantId, color: 'blue', size: 'large' })).resolves.toMatchObject({
      matched: true,
      availability: 'OUT_OF_STOCK',
      items: [{ variantId, priceMinor: 2450, stockQty: 0, availability: 'OUT_OF_STOCK' }],
    });
  });
});
