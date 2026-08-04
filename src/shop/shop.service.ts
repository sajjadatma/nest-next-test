import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CommentStatus, InventoryMovementReason, OrderStatus, Prisma, PromotionType, ShipmentStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto, OrderQuoteDto } from './dto/create-order.dto';
import { AnalyticsQueryDto, CreateOrderNoteDto, CreateProductCommentDto, InventoryAdjustmentDto, MoveCategoryDto, SaveCategoryDto, SaveProductDto, SavePromotionDto, SaveShipmentDto, SaveShippingMethodDto } from './dto/manage-shop.dto';
import { OrderNotificationService } from './order-notification.service';
import { CATALOG } from './catalog-data';

const STARTER_SHIPPING_OPTIONS = [
  { id: 'standard', label: 'Standard delivery', description: 'Reliable door-to-door delivery.', eta: '3–5 business days', priceMinor: 0 },
  { id: 'express', label: 'Express delivery', description: 'Priority handling and faster delivery.', eta: '1–2 business days', priceMinor: 1200 },
] as const;

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PACKING, OrderStatus.FULFILLED, OrderStatus.CANCELLED],
  PACKING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  FULFILLED: [],
  CANCELLED: [],
};

@Injectable()
export class ShopService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: OrderNotificationService) {}

  async onModuleInit() { await this.ensureStarterCatalog(); await this.ensureStarterShippingMethods(); }

  async catalog(category?: string, query?: string, userId?: string) {
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
    const products = await this.prisma.product.findMany({
      where: { isActive: true, ...(categoryIds ? { categoryId: { in: categoryIds } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}) },
      include: this.publicProductInclude(userId),
      orderBy: [{ featuredRank: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
    return products.map((product) => this.publicProduct(product));
  }

  async productBySlug(slug: string, userId?: string) {
    const product = await this.prisma.product.findFirst({ where: { slug, isActive: true }, include: this.publicProductInclude(userId) });
    if (!product) throw new NotFoundException('Product was not found.');
    return this.publicProduct(product);
  }

  async comments(productId: string) {
    await this.requireActiveProduct(productId);
    return this.prisma.productComment.findMany({ where: { productId, status: CommentStatus.PUBLISHED }, select: { id: true, body: true, rating: true, createdAt: true, authorId: true, author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async createComment(productId: string, dto: CreateProductCommentDto, authorId: string) {
    await this.requireActiveProduct(productId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    return this.prisma.productComment.create({ data: { productId, authorId, body, rating: dto.rating }, select: { id: true, body: true, rating: true, createdAt: true, authorId: true, author: { select: { name: true } } } });
  }

  async deleteComment(id: string, authorId: string) {
    const deleted = await this.prisma.productComment.deleteMany({ where: { id, authorId } });
    if (!deleted.count) throw new NotFoundException('Comment was not found.');
    return { deleted: true };
  }

  async moderateComment(id: string, status: CommentStatus, actorId: string, reason?: string) {
    const comment = await this.prisma.productComment.update({ where: { id }, data: { status, moderationReason: reason?.trim() || null, moderatedAt: new Date(), moderatedById: actorId } });
    await this.audit.record('shop.comment_moderated', 'product_comment', id, actorId, { status, reason });
    return comment;
  }

  async favorites(userId: string) {
    const rows = await this.prisma.favorite.findMany({ where: { userId, product: { isActive: true } }, select: { productId: true }, orderBy: { createdAt: 'desc' } });
    return { productIds: rows.map((row) => row.productId) };
  }

  async favorite(productId: string, userId: string) {
    await this.requireActiveProduct(productId);
    await this.prisma.favorite.upsert({ where: { userId_productId: { userId, productId } }, update: {}, create: { userId, productId } });
    return { favorite: true };
  }

  async unfavorite(productId: string, userId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
    return { favorite: false };
  }

  shippingOptions() { return this.prisma.shippingMethod.findMany({ where: { isActive: true }, select: { code: true, label: true, description: true, eta: true, priceMinor: true }, orderBy: [{ position: 'asc' }, { label: 'asc' }] }).then((methods) => methods.map(({ code, ...method }) => ({ id: code, ...method }))); }

  async quoteOrder(dto: OrderQuoteDto) {
    const merged = new Map<string, number>();
    for (const item of dto.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    if ([...merged.values()].some((quantity) => quantity > 20)) throw new BadRequestException('A maximum of 20 units per product is allowed.');
    const [products, shipping] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: [...merged.keys()] }, isActive: true }, select: { id: true, name: true, priceMinor: true, stockQty: true } }),
      this.prisma.shippingMethod.findFirst({ where: { code: dto.shippingMethod.trim().toLowerCase(), isActive: true }, select: { code: true, label: true, description: true, eta: true, priceMinor: true } }),
    ]);
    if (products.length !== merged.size) throw new BadRequestException('One or more products are no longer available.');
    if (products.some((product) => product.stockQty < (merged.get(product.id) ?? 0))) throw new BadRequestException('One or more products no longer have enough stock.');
    if (!shipping) throw new BadRequestException('Select a valid delivery method.');
    const subtotalMinor = products.reduce((sum, product) => sum + product.priceMinor * (merged.get(product.id) ?? 0), 0);
    const promotion = dto.promotionCode ? await this.validatePromotion(this.prisma, dto.promotionCode, subtotalMinor) : null;
    const discountMinor = promotion ? this.discountForPromotion(promotion, subtotalMinor) : 0;
    return { subtotalMinor, discountMinor, shippingMinor: shipping.priceMinor, totalMinor: subtotalMinor + shipping.priceMinor - discountMinor, promotionCode: promotion?.code ?? null, shipping: { id: shipping.code, label: shipping.label, description: shipping.description, eta: shipping.eta } };
  }

  categories() { return this.prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, position: true, _count: { select: { products: { where: { isActive: true } }, children: true } } }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }); }

  async createOrder(dto: CreateOrderDto, customer?: { id: string; email: string } | null) {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { items: true } });
    if (existing) return this.idempotentResponse(existing, dto);
    const merged = new Map<string, number>();
    for (const item of dto.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    if ([...merged.values()].some((quantity) => quantity > 20)) throw new BadRequestException('A maximum of 20 units per product is allowed.');
    const shipping = await this.prisma.shippingMethod.findFirst({ where: { code: dto.shippingMethod.trim().toLowerCase(), isActive: true } });
    if (!shipping) throw new BadRequestException('Select a valid delivery method.');
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
        const promotion = dto.promotionCode ? await this.validatePromotion(tx, dto.promotionCode, subtotalMinor) : null;
        const discountMinor = promotion ? this.discountForPromotion(promotion, subtotalMinor) : 0;
        if (promotion) {
          const claimed = await tx.promotion.updateMany({ where: { id: promotion.id, usedCount: promotion.usedCount }, data: { usedCount: { increment: 1 } } });
          if (claimed.count !== 1) throw new ConflictException('This promotion is no longer available.');
        }
        const created = await tx.order.create({ data: {
          number: `NEST-${randomUUID().slice(0, 8).toUpperCase()}`, email: dto.email.trim().toLowerCase(), phone: dto.phone.trim(),
          customerId: customer?.id, subtotalMinor, shippingMinor: shipping.priceMinor, discountMinor, totalMinor: subtotalMinor + shipping.priceMinor - discountMinor,
          promotionId: promotion?.id, promotionCode: promotion?.code, shippingMethod: shipping.code, shippingLabel: shipping.label, shippingEta: shipping.eta, idempotencyKey: dto.idempotencyKey,
          confirmationTokenHash: this.hash(dto.confirmationToken), shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
          items: { create: lines.map(({ product, quantity }) => ({ productId: product.id, productName: product.name, unitPriceMinor: product.priceMinor, quantity })) },
        }, include: { items: true } });
        await tx.orderStatusEvent.create({ data: { orderId: created.id, status: OrderStatus.PENDING, reason: 'Order placed' } });
        if (promotion) await tx.promotionRedemption.create({ data: { promotionId: promotion.id, orderId: created.id, amountMinor: discountMinor } });
        for (const { product, quantity } of lines) {
          const current = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { stockQty: true } });
          await tx.inventoryMovement.create({ data: { productId: product.id, orderId: created.id, reason: InventoryMovementReason.ORDER_RESERVATION, quantityDelta: -quantity, stockAfter: current.stockQty } });
        }
        return created;
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
    const catalogue = await this.prisma.product.findMany({ include: { category: true, images: { orderBy: { position: 'asc' } } }, orderBy: { updatedAt: 'desc' } });
    return { metrics: { products, orders, customers, revenueMinor: revenue._sum.totalMinor ?? 0 }, products: catalogue, categories };
  }

  async adminCatalog() {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({ include: { category: true, images: { orderBy: { position: 'asc' } } }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.category.findMany({ include: { _count: { select: { products: true, children: true } } }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    ]);
    return { products, categories };
  }

  async adminInventory() {
    const products = await this.prisma.product.findMany({ include: { category: true, images: { orderBy: { position: 'asc' } } }, orderBy: [{ stockQty: 'asc' }, { name: 'asc' }] });
    return { products };
  }

  async adminOrders(page = 1, query = '', status?: OrderStatus) {
    const safePage = Math.max(1, page); const pageSize = 20;
    const where: Prisma.OrderWhereInput = { ...(status ? { status } : {}), ...(query ? { OR: [{ number: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.order.findMany({ where, include: { items: true, shipments: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, skip: (safePage - 1) * pageSize, take: pageSize }), this.prisma.order.count({ where })]);
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
  async createProduct(dto: SaveProductDto, actorId: string) {
    const { galleryUrls = [], ...data } = dto;
    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...data, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || galleryUrls[0] || null, isActive: dto.isActive ?? true, images: { create: galleryUrls.map((url, position) => ({ url, position, alt: `${dto.name} view ${position + 1}` })) } }, include: { images: true } });
      await tx.inventoryMovement.create({ data: { productId: product.id, actorId, reason: InventoryMovementReason.OPENING_BALANCE, quantityDelta: product.stockQty, stockAfter: product.stockQty, note: 'Initial product stock' } });
      return product;
    });
    await this.audit.record('shop.product_created', 'product', result.id, actorId);
    return result;
  }
  async updateProduct(id: string, dto: SaveProductDto, actorId: string) {
    const { galleryUrls = [], ...data } = dto;
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id }, select: { stockQty: true } });
      if (!current) throw new NotFoundException('Product was not found.');
      const product = await tx.product.update({ where: { id }, data: { ...data, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || galleryUrls[0] || null, images: { deleteMany: {}, create: galleryUrls.map((url, position) => ({ url, position, alt: `${dto.name} view ${position + 1}` })) } }, include: { images: true } });
      const delta = product.stockQty - current.stockQty;
      if (delta) await tx.inventoryMovement.create({ data: { productId: id, actorId, reason: InventoryMovementReason.ADJUSTMENT, quantityDelta: delta, stockAfter: product.stockQty, note: 'Catalogue stock edit' } });
      return product;
    });
    await this.audit.record('shop.product_updated', 'product', id, actorId);
    return result;
  }

  async updateOrderStatus(id: string, next: OrderStatus, actorId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order was not found.');
    if (order.status === next) return order;
    if (!allowedTransitions[order.status].includes(next)) throw new ConflictException(`Order cannot move from ${order.status} to ${next}.`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: next, ...(next === OrderStatus.CANCELLED ? { cancelledAt: new Date(), cancellationReason: reason?.trim() || 'Cancelled by staff' } : {}) } });
      if (changed.count !== 1) throw new ConflictException('Order status changed. Refresh and try again.');
      if (next === OrderStatus.CANCELLED) for (const item of order.items) {
        const product = await tx.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.quantity } }, select: { stockQty: true } });
        await tx.inventoryMovement.create({ data: { productId: item.productId, orderId: id, actorId, reason: InventoryMovementReason.ORDER_CANCELLATION, quantityDelta: item.quantity, stockAfter: product.stockQty, note: reason?.trim() || 'Order cancelled' } });
      }
      await tx.orderStatusEvent.create({ data: { orderId: id, actorId, previousStatus: order.status, status: next, reason: reason?.trim() || null } });
      return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
    await this.audit.record('shop.order_status_updated', 'order', id, actorId, { previous: order.status, next, reason });
    return this.sanitizeOrder(updated);
  }

  async addOrderNote(orderId: string, dto: CreateOrderNoteDto, actorId: string) {
    await this.requireOrder(orderId);
    const note = await this.prisma.orderNote.create({ data: { orderId, authorId: actorId, body: dto.body.trim(), isCustomerVisible: dto.isCustomerVisible ?? dto.visibility === 'CUSTOMER' }, include: { author: { select: { id: true, name: true, email: true } } } });
    await this.audit.record('shop.order_note_created', 'order', orderId, actorId, { isCustomerVisible: note.isCustomerVisible });
    return note;
  }

  async saveShipment(orderId: string, dto: SaveShipmentDto, actorId: string, shipmentId?: string) {
    await this.requireOrder(orderId);
    const now = new Date();
    const statusData = dto.status === ShipmentStatus.SHIPPED ? { shippedAt: now } : dto.status === ShipmentStatus.DELIVERED ? { deliveredAt: now } : {};
    if (shipmentId && !await this.prisma.shipment.findFirst({ where: { id: shipmentId, orderId }, select: { id: true } })) throw new NotFoundException('Shipment was not found for this order.');
    const shipment = shipmentId
      ? await this.prisma.shipment.update({ where: { id: shipmentId }, data: { ...dto, ...statusData } })
      : await this.prisma.shipment.create({ data: { orderId, ...dto, ...statusData } });
    await this.audit.record(shipmentId ? 'shop.shipment_updated' : 'shop.shipment_created', 'shipment', shipment.id, actorId, { orderId, status: shipment.status, trackingNumber: shipment.trackingNumber });
    return shipment;
  }

  async saveLatestShipment(orderId: string, dto: SaveShipmentDto, actorId: string) {
    const latest = await this.prisma.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    return this.saveShipment(orderId, dto, actorId, latest?.id);
  }

  async adjustInventory(productId: string, dto: InventoryAdjustmentDto, actorId: string) {
    if (!dto.quantityDelta) throw new BadRequestException('Inventory adjustment cannot be zero.');
    if (dto.reason !== InventoryMovementReason.ADJUSTMENT && dto.reason !== InventoryMovementReason.RETURN) throw new BadRequestException('Use an allowed staff inventory adjustment reason.');
    const movement = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({ where: { id: productId, stockQty: { gte: dto.quantityDelta < 0 ? -dto.quantityDelta : 0 } }, data: { stockQty: { increment: dto.quantityDelta } } });
      if (!changed.count) throw new ConflictException('The adjustment would make stock negative.');
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQty: true } });
      return tx.inventoryMovement.create({ data: { productId, actorId, reason: dto.reason, quantityDelta: dto.quantityDelta, stockAfter: product.stockQty, note: dto.note?.trim() || null } });
    });
    await this.audit.record('shop.inventory_adjusted', 'product', productId, actorId, { movementId: movement.id, quantityDelta: dto.quantityDelta, reason: dto.reason });
    return movement;
  }

  inventory(productId: string, page = 1, pageSize = 20) {
    const skip = (Math.max(1, page) - 1) * pageSize;
    return Promise.all([this.prisma.inventoryMovement.findMany({ where: { productId }, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip, take: pageSize }), this.prisma.inventoryMovement.count({ where: { productId } })]).then(([items, total]) => ({ items, total, page: Math.max(1, page), pageSize }));
  }

  async saveShippingMethod(dto: SaveShippingMethodDto, actorId: string, id?: string) {
    const data = { ...dto, code: dto.code.trim().toLowerCase(), label: dto.label.trim(), description: dto.description?.trim() || null, eta: dto.eta.trim(), isActive: dto.isActive ?? true, position: dto.position ?? 0 };
    const method = id ? await this.prisma.shippingMethod.update({ where: { id }, data }) : await this.prisma.shippingMethod.create({ data });
    await this.audit.record(id ? 'shop.shipping_method_updated' : 'shop.shipping_method_created', 'shipping_method', method.id, actorId, { code: method.code, isActive: method.isActive });
    return method;
  }
  adminShippingMethods() { return this.prisma.shippingMethod.findMany({ orderBy: [{ position: 'asc' }, { label: 'asc' }] }); }

  async savePromotion(dto: SavePromotionDto, actorId: string, id?: string) {
    const code = dto.code.trim().toUpperCase();
    if (dto.type === PromotionType.PERCENTAGE && dto.value > 100) throw new BadRequestException('Percentage promotions cannot exceed 100%.');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null; const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && startsAt >= endsAt) throw new BadRequestException('Promotion end must be after its start.');
    const data = { code, type: dto.type, value: dto.value, minimumSubtotalMinor: dto.minimumSubtotalMinor ?? null, usageLimit: dto.usageLimit ?? null, startsAt, endsAt, isActive: dto.isActive ?? true };
    const promotion = id ? await this.prisma.promotion.update({ where: { id }, data }) : await this.prisma.promotion.create({ data });
    await this.audit.record(id ? 'shop.promotion_updated' : 'shop.promotion_created', 'promotion', promotion.id, actorId, { code: promotion.code, isActive: promotion.isActive });
    return promotion;
  }
  adminPromotions() { return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } }); }

  adminComments(page = 1, pageSize = 20, status?: CommentStatus) {
    const where = status ? { status } : {};
    return Promise.all([this.prisma.productComment.findMany({ where, include: { product: { select: { id: true, name: true, slug: true } }, author: { select: { id: true, name: true, email: true } }, moderatedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, page) - 1) * pageSize, take: pageSize }), this.prisma.productComment.count({ where })]).then(([items, total]) => ({ items, total, page: Math.max(1, page), pageSize }));
  }

  async analytics(query: AnalyticsQueryDto = {}) {
    const { from, to } = this.resolveAnalyticsRange(query);
    const createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const where: Prisma.OrderWhereInput = { ...(Object.keys(createdAt).length ? { createdAt } : {}) };
    const completed = { ...where, status: { in: [OrderStatus.CONFIRMED, OrderStatus.PACKING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.FULFILLED] } };
    const completedStatuses = completed.status.in;
    const completedStatusSql = Prisma.join(completedStatuses.map((status) => Prisma.sql`${status}::"OrderStatus"`));
    const reportDateFilters: Prisma.Sql[] = [];
    if (from) reportDateFilters.push(Prisma.sql`o."createdAt" >= ${from}`);
    if (to) reportDateFilters.push(Prisma.sql`o."createdAt" <= ${to}`);
    const [orders, revenue, lowStock, topProductRows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where: completed, _sum: { subtotalMinor: true, totalMinor: true, shippingMinor: true, discountMinor: true } }),
      this.prisma.$queryRaw<Array<{ id: string; name: string; stockQty: number; lowStockThreshold: number }>>(Prisma.sql`SELECT "id", "name", "stockQty", "lowStockThreshold" FROM "Product" WHERE "isActive" = true AND "stockQty" <= "lowStockThreshold" ORDER BY "stockQty" ASC, "name" ASC LIMIT 50`),
      this.prisma.$queryRaw<Array<{ productId: string; productName: string; units: bigint; revenueMinor: bigint; unitPriceMinorSum: bigint }>>(Prisma.sql`SELECT oi."productId", oi."productName", SUM(oi."quantity") AS "units", SUM(oi."quantity" * oi."unitPriceMinor") AS "revenueMinor", SUM(oi."unitPriceMinor") AS "unitPriceMinorSum" FROM "OrderItem" oi INNER JOIN "Order" o ON o."id" = oi."orderId" WHERE o."status" IN (${completedStatusSql}) ${reportDateFilters.length ? Prisma.sql`AND ${Prisma.join(reportDateFilters, ' AND ')}` : Prisma.empty} GROUP BY oi."productId", oi."productName" ORDER BY "units" DESC, oi."productName" ASC LIMIT 10`),
    ]);
    const topProducts = topProductRows.map((product) => {
      const units = Number(product.units);
      const revenueMinor = Number(product.revenueMinor);
      return { productId: product.productId, productName: product.productName, name: product.productName, units, revenueMinor, _sum: { quantity: units, unitPriceMinor: Number(product.unitPriceMinorSum) } };
    });
    const grossSalesMinor = revenue._sum.subtotalMinor ?? 0;
    const netSalesMinor = revenue._sum.totalMinor ?? 0;
    const shippingMinor = revenue._sum.shippingMinor ?? 0;
    const discountsMinor = revenue._sum.discountMinor ?? 0;
    return { range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, key: query.range ?? null }, orders, revenueMinor: netSalesMinor, shippingRevenueMinor: shippingMinor, discountsMinor, lowStock, topProducts, metrics: { grossSalesMinor, discountsMinor, shippingMinor, refundsMinor: 0, netSalesMinor, orders } };
  }

  private resolveAnalyticsRange(query: AnalyticsQueryDto) {
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) throw new BadRequestException('Report dates must form a valid chronological range.');
      return { from, to };
    }
    if (!query.range) return { from: undefined, to: undefined };
    const days = Number.parseInt(query.range, 10);
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
    return { from, to };
  }

  auditFeed(page = 1, pageSize = 20) {
    const skip = (Math.max(1, page) - 1) * pageSize; const where = { action: { startsWith: 'shop.' } };
    return Promise.all([this.prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip, take: pageSize }), this.prisma.auditLog.count({ where })]).then(([items, total]) => ({ items, total, page: Math.max(1, page), pageSize }));
  }

  private async ensureStarterShippingMethods() {
    for (const method of STARTER_SHIPPING_OPTIONS) {
      await this.prisma.shippingMethod.upsert({
        where: { code: method.id },
        update: {},
        create: { code: method.id, label: method.label, description: method.description, eta: method.eta, priceMinor: method.priceMinor, position: method.id === 'standard' ? 0 : 1 },
      });
    }
  }

  private async validatePromotion(tx: Prisma.TransactionClient | PrismaService, code: string, subtotalMinor: number) {
    const now = new Date();
    const promotion = await tx.promotion.findFirst({ where: { code: code.trim().toUpperCase(), isActive: true } });
    if (!promotion || (promotion.startsAt && promotion.startsAt > now) || (promotion.endsAt && promotion.endsAt < now)) throw new BadRequestException('This promotion is not available.');
    if (promotion.minimumSubtotalMinor && subtotalMinor < promotion.minimumSubtotalMinor) throw new BadRequestException('This promotion requires a larger order subtotal.');
    if (promotion.usageLimit !== null && promotion.usedCount >= promotion.usageLimit) throw new BadRequestException('This promotion has reached its usage limit.');
    return promotion;
  }

  private discountForPromotion(promotion: { type: PromotionType; value: number }, subtotalMinor: number) {
    return Math.min(subtotalMinor, promotion.type === PromotionType.PERCENTAGE ? Math.floor(subtotalMinor * promotion.value / 100) : promotion.value);
  }

  private async requireOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order was not found.');
    return order;
  }

  private async ensureStarterCatalog() {
    for (const item of CATALOG) {
      const category = await this.prisma.category.upsert({ where: { slug: item.categorySlug }, update: {}, create: { slug: item.categorySlug, name: item.category } });
      const product = await this.prisma.product.upsert({
        where: { slug: item.slug },
        update: {},
        create: { name: item.name, slug: item.slug, description: item.description, priceMinor: item.priceMinor, stockQty: item.stockQty, imageUrl: item.images[0], material: item.material, dimensions: item.dimensions, care: item.care, featuredRank: item.featuredRank, categoryId: category.id },
        include: { images: true },
      });
      const missingDetails = !product.material || !product.dimensions || !product.care || (item.featuredRank && !product.featuredRank);
      if (missingDetails) await this.prisma.product.update({ where: { id: product.id }, data: { material: product.material || item.material, dimensions: product.dimensions || item.dimensions, care: product.care || item.care, featuredRank: product.featuredRank || item.featuredRank } });
      if (!product.images.length) await this.prisma.productImage.createMany({ data: item.images.map((url, position) => ({ productId: product.id, url, position, alt: `${item.name} view ${position + 1}` })) });
    }
  }

  private requireActiveProduct(id: string) {
    return this.prisma.product.findFirst({ where: { id, isActive: true }, select: { id: true } }).then((product) => {
      if (!product) throw new NotFoundException('Product was not found.');
      return product;
    });
  }

  private publicProductInclude(userId?: string) {
    return {
      category: { select: { name: true, slug: true } },
      images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' as const } },
      favorites: { where: { userId: userId ?? '__guest__' }, select: { userId: true } },
      comments: { where: { status: CommentStatus.PUBLISHED }, select: { rating: true } },
    };
  }

  private publicProduct<T extends { favorites: unknown[]; comments: Array<{ rating: number | null }>; [key: string]: unknown }>(product: T) {
    const ratings = product.comments.flatMap((comment) => comment.rating == null ? [] : [comment.rating]);
    const { favorites, comments, ...details } = product;
    return { ...details, isFavorite: favorites.length > 0, commentCount: comments.length, averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null };
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
