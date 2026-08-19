import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

describe('PostgreSQL database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.b2bCartLine.deleteMany();
    await prisma.b2bCart.deleteMany();
    await prisma.priceTier.deleteMany();
    await prisma.priceListItem.deleteMany();
    await prisma.priceList.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.companyMembership.deleteMany();
    await prisma.company.deleteMany();
    await prisma.customerGroup.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
  });

  it('enforces unique emails and cascading role assignments', async () => {
    const user = await prisma.user.create({ data: { email: 'db@example.com', passwordHash: 'hash' } });
    await expect(prisma.user.create({ data: { email: 'db@example.com', passwordHash: 'hash' } })).rejects.toMatchObject({ code: 'P2002' });
    const role = await prisma.role.create({ data: { key: 'user', name: 'User' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    await prisma.user.delete({ where: { id: user.id } });
    await expect(prisma.userRole.count()).resolves.toBe(0);
  });

  it('keeps writes atomic when a transaction fails', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { email: 'rolled-back@example.com', passwordHash: 'hash' } });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    await expect(prisma.user.findUnique({ where: { email: 'rolled-back@example.com' } })).resolves.toBeNull();
  });

  it('queries inherited and direct permissions with relational integrity', async () => {
    const [user, role, inherited, direct] = await Promise.all([
      prisma.user.create({ data: { email: 'permissions@example.com', passwordHash: 'hash' } }),
      prisma.role.create({ data: { key: 'manager', name: 'Manager' } }),
      prisma.permission.create({ data: { key: 'dashboard:read', name: 'Dashboard' } }),
      prisma.permission.create({ data: { key: 'roles:manage', name: 'Roles' } }),
    ]);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: inherited.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.userPermission.create({ data: { userId: user.id, permissionId: direct.id } });

    const result = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissions: { include: { permission: true } } } });
    expect(result.roles[0].role.permissions[0].permission.key).toBe('dashboard:read');
    expect(result.permissions[0].permission.key).toBe('roles:manage');
  });

  it('enforces B2B identity and pricing uniqueness', async () => {
    const category = await prisma.category.create({ data: { name: 'B2B fixtures', slug: 'b2b-fixtures' } });
    const product = await prisma.product.create({
      data: {
        name: 'B2B fixture product',
        slug: 'b2b-fixture-product',
        description: 'Database fixture',
        priceMinor: 1250,
        categoryId: category.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'LEGACY-B2B-FIXTURE',
        name: product.name,
        basePriceMinor: product.priceMinor,
      },
    });
    await expect(prisma.productVariant.create({
      data: { productId: product.id, sku: 'LEGACY-B2B-FIXTURE', name: 'Duplicate', basePriceMinor: 1250 },
    })).rejects.toMatchObject({ code: 'P2002' });

    const group = await prisma.customerGroup.create({ data: { name: 'Wholesale', code: 'WHOLESALE' } });
    const company = await prisma.company.create({ data: { name: 'Fixture Company', slug: 'fixture-company', customerGroupId: group.id } });
    const user = await prisma.user.create({ data: { email: 'b2b-fixture@example.com', passwordHash: 'hash' } });
    await prisma.companyMembership.create({ data: { companyId: company.id, userId: user.id, role: 'OWNER' } });
    await expect(prisma.companyMembership.create({ data: { companyId: company.id, userId: user.id, role: 'BUYER' } })).rejects.toMatchObject({ code: 'P2002' });

    const priceList = await prisma.priceList.create({ data: { name: 'Wholesale USD', code: 'WHOLESALE-USD', currency: 'USD', customerGroupId: group.id } });
    const item = await prisma.priceListItem.create({ data: { priceListId: priceList.id, variantId: variant.id, priceMinor: 1000 } });
    await prisma.priceTier.create({ data: { priceListItemId: item.id, minimumQuantity: 10, unitPriceMinor: 850 } });
    await expect(prisma.priceTier.create({ data: { priceListItemId: item.id, minimumQuantity: 10, unitPriceMinor: 800 } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes persisted B2B carts by company, user, and currency', async () => {
    const category = await prisma.category.create({ data: { name: 'Cart fixtures', slug: `cart-fixtures-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { name: 'Cart fixture product', slug: `cart-fixture-${randomUUID()}`, description: 'Cart fixture', priceMinor: 1000, categoryId: category.id } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `CART-${randomUUID().slice(0, 8).toUpperCase()}`, name: product.name, basePriceMinor: 1000, stockQty: 20 } });
    const company = await prisma.company.create({ data: { name: 'Cart Company', slug: `cart-company-${randomUUID()}` } });
    const user = await prisma.user.create({ data: { email: `cart-${randomUUID()}@example.com`, passwordHash: 'hash' } });
    await prisma.companyMembership.create({ data: { companyId: company.id, userId: user.id, role: 'BUYER' } });

    const cart = await prisma.b2bCart.create({ data: { companyId: company.id, userId: user.id, currency: 'USD' } });
    await prisma.b2bCartLine.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 3 } });
    await expect(prisma.b2bCartLine.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 2 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.b2bCart.create({ data: { companyId: company.id, userId: user.id, currency: 'USD' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.b2bCart.create({ data: { companyId: company.id, userId: user.id, currency: 'EUR' } })).resolves.toMatchObject({ currency: 'EUR' });
  });
});
