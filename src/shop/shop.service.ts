import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { MoveCategoryDto, SaveCategoryDto, SaveProductDto } from './dto/manage-shop.dto';
import { OrderNotificationService } from './order-notification.service';

const CATALOG = [
  { category: 'Everyday', categorySlug: 'everyday', name: 'Canvas Market Tote', slug: 'canvas-market-tote', description: 'A hard-wearing carryall for the market, commute, and everywhere in between.', priceMinor: 3800, stockQty: 18, imageUrl: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80' },
  { category: 'Home', categorySlug: 'home', name: 'Ridge Ceramic Mug', slug: 'ridge-ceramic-mug', description: 'A quietly tactile stoneware mug made for slow morning rituals.', priceMinor: 2600, stockQty: 24, imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80' },
  { category: 'Desk', categorySlug: 'desk', name: 'Walnut Desk Tray', slug: 'walnut-desk-tray', description: 'A clean landing place for keys, notes, and small daily essentials.', priceMinor: 5400, stockQty: 10, imageUrl: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=80' },
  { category: 'Everyday', categorySlug: 'everyday', name: 'Field Notebook Set', slug: 'field-notebook-set', description: 'Three unlined notebooks with tactile recycled covers.', priceMinor: 1800, stockQty: 40, imageUrl: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=900&q=80' },
] as const;

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.FULFILLED, OrderStatus.CANCELLED],
  FULFILLED: [], CANCELLED: [],
};

@Injectable()
export class ShopService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: OrderNotificationService) {}

  async onModuleInit() { await this.ensureStarterCatalog(); }

  async catalog(category?: string, query?: string) {
    let categoryIds: string[] | undefined;
    if (category) {
      const selected = await this.prisma.category.findUnique({ where: { slug: category }, select: { id: true } });
      if (!selected) return [];
      const categories = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      const descendants = new Set([selected.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of categories) if (candidate.parentId && descendants.has(candidate.parentId) && !descendants.has(candidate.id)) { descendants.add(candidate.id); changed = true; }
      }
      categoryIds = [...descendants];
    }
    return this.prisma.product.findMany({ where: { isActive: true, ...(categoryIds ? { categoryId: { in: categoryIds } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}) }, include: { category: { select: { name: true, slug: true } } }, orderBy: { name: 'asc' } });
  }

  categories() { return this.prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, position: true, _count: { select: { products: { where: { isActive: true } }, children: true } } }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }); }

  async createOrder(dto: CreateOrderDto, customer?: { id: string; email: string } | null) {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { items: true } });
    if (existing) return this.idempotentResponse(existing, dto);
    const merged = new Map<string, number>();
    for (const item of dto.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    if ([...merged.values()].some((quantity) => quantity > 20)) throw new BadRequestException('A maximum of 20 units per product is allowed.');
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const ids = [...merged.keys()];
        const products = await tx.product.findMany({ where: { id: { in: ids }, isActive: true } });
        if (products.length !== ids.length) throw new BadRequestException('One or more products are no longer available.');
        const lines = ids.map((id) => ({ product: products.find((candidate) => candidate.id === id)!, quantity: merged.get(id)! }));
        for (const { product, quantity } of lines) {
          const reserved = await tx.product.updateMany({ where: { id: product.id, isActive: true, stockQty: { gte: quantity } }, data: { stockQty: { decrement: quantity } } });
          if (reserved.count !== 1) throw new BadRequestException(`${product.name} does not have enough stock.`);
        }
        const subtotalMinor = lines.reduce((sum, { product, quantity }) => sum + product.priceMinor * quantity, 0);
        return tx.order.create({ data: {
          number: `NEST-${randomUUID().slice(0, 8).toUpperCase()}`, email: dto.email.trim().toLowerCase(), phone: dto.phone.trim(),
          customerId: customer?.id, subtotalMinor, shippingMinor: 0, totalMinor: subtotalMinor, idempotencyKey: dto.idempotencyKey,
          confirmationTokenHash: this.hash(dto.confirmationToken), shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
          items: { create: lines.map(({ product, quantity }) => ({ productId: product.id, productName: product.name, unitPriceMinor: product.priceMinor, quantity })) },
        }, include: { items: true } });
      });
    } catch (reason) {
      if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2002') {
        const duplicate = await this.prisma.order.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { items: true } });
        if (duplicate) return this.idempotentResponse(duplicate, dto);
      }
      throw reason;
    }
    const delivery = await this.notifications.sendConfirmation(order, dto.confirmationToken).catch(() => ({ status: 'FAILED' as const }));
    await this.prisma.order.update({ where: { id: order.id }, data: { confirmationEmailStatus: delivery.status, confirmationEmailId: 'id' in delivery ? delivery.id : undefined } });
    await this.audit.record('shop.order_created', 'order', order.id, customer?.id, { number: order.number, totalMinor: order.totalMinor });
    return { ...this.sanitizeOrder(order), confirmationToken: dto.confirmationToken, confirmationEmailStatus: delivery.status };
  }

  async confirmation(token: string) {
    const order = await this.prisma.order.findUnique({ where: { confirmationTokenHash: this.hash(token) }, include: { items: true } });
    if (!order) throw new NotFoundException('Order confirmation was not found.');
    return this.sanitizeOrder(order);
  }

  async ordersForCustomer(customerId: string) { return (await this.prisma.order.findMany({ where: { customerId }, include: { items: true }, orderBy: { createdAt: 'desc' } })).map((order) => this.sanitizeOrder(order)); }

  async adminOverview() {
    const [products, orders, customers, revenue, categories] = await Promise.all([
      this.prisma.product.count(), this.prisma.order.count(), this.prisma.order.groupBy({ by: ['email'] }).then((rows) => rows.length),
      this.prisma.order.aggregate({ _sum: { totalMinor: true }, where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.FULFILLED] } } }),
      this.prisma.category.findMany({ include: { _count: { select: { products: true, children: true } } }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    ]);
    const catalogue = await this.prisma.product.findMany({ include: { category: true }, orderBy: { updatedAt: 'desc' } });
    return { metrics: { products, orders, customers, revenueMinor: revenue._sum.totalMinor ?? 0 }, products: catalogue, categories };
  }

  async adminOrders(page = 1, query = '', status?: OrderStatus) {
    const safePage = Math.max(1, page); const pageSize = 20;
    const where: Prisma.OrderWhereInput = { ...(status ? { status } : {}), ...(query ? { OR: [{ number: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (safePage - 1) * pageSize, take: pageSize }), this.prisma.order.count({ where })]);
    return { items: items.map((order) => this.sanitizeOrder(order)), total, page: safePage, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async createCategory(dto: SaveCategoryDto, actorId: string) {
    const parentId = dto.parentId || null;
    if (parentId) await this.requireCategory(parentId);
    const position = await this.prisma.category.count({ where: { parentId } });
    const result = await this.prisma.category.create({ data: { name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), parentId, position } });
    await this.audit.record('shop.category_created', 'category', result.id, actorId, { parentId });
    return result;
  }

  async updateCategory(id: string, dto: SaveCategoryDto, actorId: string) {
    const current = await this.requireCategory(id);
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId || null;
    await this.assertValidCategoryParent(id, parentId);
    const result = await this.prisma.$transaction(async (tx) => {
      let position = current.position;
      if (parentId !== current.parentId) {
        position = await tx.category.count({ where: { parentId } });
        await this.compactCategoryPositions(tx, current.parentId, id);
      }
      return tx.category.update({ where: { id }, data: { name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), parentId, position } });
    });
    await this.audit.record('shop.category_updated', 'category', id, actorId, { parentId });
    return result;
  }

  async moveCategory(id: string, dto: MoveCategoryDto, actorId: string) {
    const current = await this.requireCategory(id);
    const parentId = dto.parentId || null;
    await this.assertValidCategoryParent(id, parentId);
    const result = await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.category.findMany({ where: { parentId, id: { not: id } }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true } });
      const position = Math.min(dto.position, siblings.length);
      siblings.splice(position, 0, { id });
      if (current.parentId !== parentId) await this.compactCategoryPositions(tx, current.parentId, id);
      for (const [index, sibling] of siblings.entries()) await tx.category.update({ where: { id: sibling.id }, data: { parentId, position: index } });
      return tx.category.findUniqueOrThrow({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    });
    await this.audit.record('shop.category_moved', 'category', id, actorId, { parentId, position: dto.position });
    return result;
  }

  async deleteCategory(id: string, actorId: string) {
    const category = await this.prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    if (!category) throw new NotFoundException('Category was not found.');
    if (category._count.products) throw new ConflictException('Move or remove this category’s products before deleting it.');
    if (category._count.children) throw new ConflictException('Move or remove child categories before deleting this category.');
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.compactCategoryPositions(tx, category.parentId, id);
    });
    await this.audit.record('shop.category_deleted', 'category', id, actorId, { name: category.name });
    return { deleted: true };
  }
  async createProduct(dto: SaveProductDto, actorId: string) { const result = await this.prisma.product.create({ data: { ...dto, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || null, isActive: dto.isActive ?? true } }); await this.audit.record('shop.product_created', 'product', result.id, actorId); return result; }
  async updateProduct(id: string, dto: SaveProductDto, actorId: string) { const result = await this.prisma.product.update({ where: { id }, data: { ...dto, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || null } }); await this.audit.record('shop.product_updated', 'product', id, actorId); return result; }

  async updateOrderStatus(id: string, next: OrderStatus, actorId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order was not found.');
    if (order.status === next) return order;
    if (!allowedTransitions[order.status].includes(next)) throw new ConflictException(`Order cannot move from ${order.status} to ${next}.`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: next, ...(next === OrderStatus.CANCELLED ? { cancelledAt: new Date(), cancellationReason: reason?.trim() || 'Cancelled by staff' } : {}) } });
      if (changed.count !== 1) throw new ConflictException('Order status changed. Refresh and try again.');
      if (next === OrderStatus.CANCELLED) for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.quantity } } });
      return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
    await this.audit.record('shop.order_status_updated', 'order', id, actorId, { previous: order.status, next, reason });
    return this.sanitizeOrder(updated);
  }

  private async ensureStarterCatalog() {
    if (await this.prisma.product.count()) return;
    for (const item of CATALOG) {
      const category = await this.prisma.category.upsert({ where: { slug: item.categorySlug }, update: {}, create: { slug: item.categorySlug, name: item.category } });
      await this.prisma.product.create({ data: { name: item.name, slug: item.slug, description: item.description, priceMinor: item.priceMinor, stockQty: item.stockQty, imageUrl: item.imageUrl, categoryId: category.id } });
    }
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category was not found.');
    return category;
  }

  private async assertValidCategoryParent(id: string, parentId: string | null) {
    if (!parentId) return;
    if (parentId === id) throw new BadRequestException('A category cannot be its own parent.');
    await this.requireCategory(parentId);
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) throw new BadRequestException('A category cannot be nested inside one of its descendants.');
      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = parent?.parentId ?? null;
    }
  }

  private async compactCategoryPositions(tx: Prisma.TransactionClient, parentId: string | null, excludedId: string) {
    const siblings = await tx.category.findMany({ where: { parentId, id: { not: excludedId } }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true } });
    for (const [index, sibling] of siblings.entries()) await tx.category.update({ where: { id: sibling.id }, data: { position: index } });
  }

  private idempotentResponse(order: { idempotencyKey: string; confirmationTokenHash: string; email: string; [key: string]: unknown }, dto: CreateOrderDto) {
    if (order.email !== dto.email.trim().toLowerCase() || order.confirmationTokenHash !== this.hash(dto.confirmationToken)) throw new ConflictException('Idempotency key was already used for another checkout.');
    return { ...this.sanitizeOrder(order), confirmationToken: dto.confirmationToken };
  }
  private sanitizeOrder<T extends { idempotencyKey: string; confirmationTokenHash: string }>(order: T): Omit<T, 'idempotencyKey' | 'confirmationTokenHash'> {
    const { idempotencyKey: _idempotencyKey, confirmationTokenHash: _confirmationTokenHash, ...safe } = order;
    void _idempotencyKey;
    void _confirmationTokenHash;
    return safe;
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
