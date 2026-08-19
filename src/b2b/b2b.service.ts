import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { B2bCartQueryDto, B2bPurchaseRequestQueryDto, CreateB2bPurchaseRequestDto, ReviewB2bPurchaseRequestDto, SaveB2bCartLineDto, SaveCustomerGroupDto, SavePriceListDto, SavePriceListItemDto, SavePriceTierDto, SaveVariantDto } from './dto/b2b.dto';
import { AddCompanyMemberDto, CreateCompanyDto, SaveCompanyAddressDto, UpdateCompanyDto, UpdateCompanyMemberDto } from './dto/company.dto';

type Db = any;

/** B2B catalogue and pricing operations. B2B data is intentionally isolated from the B2C Product API. */
@Injectable()
export class B2bService {
  private readonly db: Db;

  constructor(private readonly prisma: PrismaService, private readonly audit?: AuditService) { this.db = prisma as Db; }

  normalizeSku(value: string) {
    const sku = value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!sku || !/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) throw new BadRequestException('SKU may contain only letters, numbers, dots, underscores and hyphens.');
    return sku;
  }

  private normalizeCode(value: string) {
    const code = value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code || !/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) throw new BadRequestException('Customer group code is invalid.');
    return code;
  }

  private validateQuantityRules(dto: Pick<SaveVariantDto, 'minimumOrderQty' | 'packSize' | 'quantityIncrement' | 'stockQty'> & { lowStockThreshold?: number }) {
    for (const [key, value] of Object.entries({ minimumOrderQty: dto.minimumOrderQty, packSize: dto.packSize, quantityIncrement: dto.quantityIncrement, stockQty: dto.stockQty, lowStockThreshold: dto.lowStockThreshold ?? 5 })) {
      if (!Number.isInteger(value) || value < 0 || (key !== 'stockQty' && value < 1)) throw new BadRequestException(`${key} must be a valid positive integer.`);
    }
    if (dto.quantityIncrement > 0 && dto.minimumOrderQty % dto.quantityIncrement !== 0) throw new BadRequestException('minimumOrderQty must be divisible by quantityIncrement.');
  }

  private parseOptions(options?: string) {
    if (!options?.trim()) return null;
    try { return JSON.parse(options); } catch { throw new BadRequestException('Variant options must be valid JSON.'); }
  }

  /** ProductVariant's persisted base price is named basePriceMinor in Prisma. */
  private priceOfVariant(variant: any) { return variant.basePriceMinor ?? 0; }

  private async assertVariant(id: string) {
    const variant = await this.db.productVariant.findUnique({ where: { id }, include: { product: { include: { category: true } } } });
    if (!variant) throw new NotFoundException('Product variant was not found.');
    return variant;
  }

  private async assertCompanyAccess(companyId: string, userId: string) {
    const company = await this.db.company.findUnique({ where: { id: companyId }, include: { customerGroup: true } });
    if (!company || (company.status && company.status !== 'ACTIVE')) throw new NotFoundException('Company was not found.');
    const membership = await this.db.companyMembership.findFirst({ where: { companyId, userId } });
    if (!membership || (membership.status && membership.status !== 'ACTIVE')) throw new NotFoundException('Company was not found.');
    return { company, membership };
  }

  async listCompanies(userId?: string) {
    if (!userId) return this.db.company.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { memberships: true } } } });
    const memberships = await this.db.companyMembership.findMany({ where: { userId }, include: { company: { include: { customerGroup: true } } }, orderBy: { createdAt: 'asc' } });
    return memberships.filter((row: any) => (!row.status || row.status === 'ACTIVE') && (!row.company?.status || row.company.status === 'ACTIVE')).map((row: any) => ({ ...row.company, membership: { id: row.id, role: row.role, status: row.status } }));
  }

  async listVariants(query?: string, activeOnly = false) {
    return this.db.productVariant.findMany({ where: { ...(activeOnly ? { isActive: true } : {}), ...(query ? { OR: [{ sku: { contains: query.trim(), mode: 'insensitive' } }, { name: { contains: query.trim(), mode: 'insensitive' } }] } : {}) }, include: { product: { select: { id: true, name: true, slug: true, imageUrl: true, categoryId: true } } }, orderBy: [{ position: 'asc' }, { sku: 'asc' }] });
  }

  async getVariant(id: string) { return this.assertVariant(id); }

  async createVariant(productId: string, dto: SaveVariantDto) {
    const normalized = { stockQty: dto.stockQty ?? 0, lowStockThreshold: dto.lowStockThreshold ?? 5, minimumOrderQty: dto.minimumOrderQty ?? 1, packSize: dto.packSize ?? 1, quantityIncrement: dto.quantityIncrement ?? 1 };
    const sku = this.normalizeSku(dto.sku); this.validateQuantityRules(normalized);
    const product = await this.db.product.findUnique({ where: { id: productId }, select: { id: true, currency: true } });
    if (!product) throw new NotFoundException('Product was not found.');
    try {
      return await this.db.productVariant.create({ data: { productId, sku, name: dto.name.trim(), options: this.parseOptions(dto.options), basePriceMinor: dto.basePriceMinor, currency: (dto.currency ?? product.currency).trim().toUpperCase(), ...normalized, isActive: dto.isActive ?? true, position: dto.position ?? 0 }, include: { product: true } });
    } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async updateVariant(id: string, dto: SaveVariantDto) {
    await this.assertVariant(id); const normalized = { stockQty: dto.stockQty ?? 0, lowStockThreshold: dto.lowStockThreshold ?? 5, minimumOrderQty: dto.minimumOrderQty ?? 1, packSize: dto.packSize ?? 1, quantityIncrement: dto.quantityIncrement ?? 1 }; const sku = this.normalizeSku(dto.sku); this.validateQuantityRules(normalized);
    try { return await this.db.productVariant.update({ where: { id }, data: { sku, name: dto.name.trim(), options: this.parseOptions(dto.options), basePriceMinor: dto.basePriceMinor, ...(dto.currency === undefined ? {} : { currency: dto.currency.trim().toUpperCase() }), ...normalized, ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }), ...(dto.position === undefined ? {} : { position: dto.position }) }, include: { product: true } }); } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async archiveVariant(id: string) { await this.assertVariant(id); await this.db.productVariant.update({ where: { id }, data: { isActive: false } }); return { archived: true }; }

  async customerGroups() { return this.db.customerGroup.findMany({ orderBy: [{ name: 'asc' }] }); }

  async createCustomerGroup(dto: SaveCustomerGroupDto) { try { return await this.db.customerGroup.create({ data: { name: dto.name.trim(), code: this.normalizeCode(dto.code), isActive: dto.isActive ?? true } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async updateCustomerGroup(id: string, dto: SaveCustomerGroupDto) { try { return await this.db.customerGroup.update({ where: { id }, data: { name: dto.name.trim(), code: this.normalizeCode(dto.code), ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) } }); } catch (error) { if (this.isNotFound(error)) throw new NotFoundException('Customer group was not found.'); this.rethrowConflict(error); throw error; } }

  async priceLists(customerGroupId?: string) { return this.db.priceList.findMany({ where: customerGroupId ? { customerGroupId } : undefined, include: { customerGroup: true, items: { include: { variant: { include: { product: true } }, tiers: { orderBy: { minimumQuantity: 'asc' } } } } }, orderBy: [{ priority: 'desc' }, { name: 'asc' }] }); }

  async createPriceList(dto: SavePriceListDto) { await this.assertCustomerGroup(dto.customerGroupId); this.validatePriceListDates(dto); return this.db.priceList.create({ data: { name: dto.name.trim(), code: this.normalizeCode(dto.code ?? dto.name), currency: this.normalizeCurrency(dto.currency), priority: dto.priority ?? 0, isActive: dto.isActive ?? true, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, endsAt: dto.endsAt ? new Date(dto.endsAt) : null, customerGroupId: dto.customerGroupId }, include: { customerGroup: true } }); }

  async updatePriceList(id: string, dto: SavePriceListDto) { await this.assertCustomerGroup(dto.customerGroupId); this.validatePriceListDates(dto); try { return await this.db.priceList.update({ where: { id }, data: { name: dto.name.trim(), ...(dto.code === undefined ? {} : { code: this.normalizeCode(dto.code) }), currency: this.normalizeCurrency(dto.currency), priority: dto.priority ?? 0, isActive: dto.isActive ?? true, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, endsAt: dto.endsAt ? new Date(dto.endsAt) : null, customerGroupId: dto.customerGroupId }, include: { customerGroup: true } }); } catch (error) { if (this.isNotFound(error)) throw new NotFoundException('Price list was not found.'); this.rethrowConflict(error); throw error; } }

  async archivePriceList(id: string) { await this.assertPriceList(id); await this.db.priceList.update({ where: { id }, data: { isActive: false } }); return { archived: true }; }

  async savePriceListItem(dto: SavePriceListItemDto) { await this.assertVariant(dto.variantId); await this.assertPriceList(dto.priceListId); try { return await this.db.priceListItem.upsert({ where: { priceListId_variantId: { priceListId: dto.priceListId, variantId: dto.variantId } }, update: { priceMinor: dto.priceMinor }, create: { priceListId: dto.priceListId, variantId: dto.variantId, priceMinor: dto.priceMinor }, include: { tiers: true, variant: true } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async savePriceTier(dto: SavePriceTierDto) { if (dto.minimumQuantity < 1 || dto.unitPriceMinor < 0) throw new BadRequestException('Tier quantity and price are invalid.'); await this.assertPriceListItem(dto.priceListItemId); try { return await this.db.priceTier.upsert({ where: { priceListItemId_minimumQuantity: { priceListItemId: dto.priceListItemId, minimumQuantity: dto.minimumQuantity } }, update: { unitPriceMinor: dto.unitPriceMinor }, create: { priceListItemId: dto.priceListItemId, minimumQuantity: dto.minimumQuantity, unitPriceMinor: dto.unitPriceMinor } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async catalog(companyId: string, userId: string, query: { q?: string; currency?: string; page?: number; pageSize?: number }) {
    const { company } = await this.assertCompanyAccess(companyId, userId);
    const page = Math.max(1, query.page ?? 1); const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 24)); const q = query.q?.trim();
    const where: any = { isActive: true, product: { isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) } };
    const [items, total] = await Promise.all([this.db.productVariant.findMany({ where, include: { product: { select: { id: true, name: true, slug: true, description: true, imageUrl: true, categoryId: true, category: { select: { id: true, name: true, slug: true } } } } }, orderBy: [{ position: 'asc' }, { sku: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }), this.db.productVariant.count({ where })]);
    const data = await Promise.all(items.map((variant: any) => this.effectivePriceForVariant(company.customerGroupId, variant, 1, (query.currency ?? variant.currency ?? 'USD').toUpperCase(), false)));
    return { items: data, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), companyId, customerGroupId: company.customerGroupId ?? null };
  }

  async price(companyId: string, userId: string, variantId: string, quantity: number, currency?: string) { const { company } = await this.assertCompanyAccess(companyId, userId); const variant = await this.assertVariant(variantId); return this.effectivePriceForVariant(company.customerGroupId, variant, quantity, (currency ?? variant.currency ?? 'USD').toUpperCase()); }

  async getCart(companyId: string, userId: string, query: B2bCartQueryDto = {}) {
    const { company } = await this.assertCompanyAccess(companyId, userId);
    const currency = this.resolveCartCurrency(company, query.currency);
    const cart = await this.db.b2bCart.findUnique({
      where: { companyId_userId_currency: { companyId, userId, currency } },
      include: { lines: { include: { variant: { include: { product: { include: { category: true } } } } }, orderBy: { createdAt: 'asc' } } },
    });
    return this.formatCart(cart, company, companyId, currency);
  }

  async addCartLine(companyId: string, userId: string, dto: SaveB2bCartLineDto) {
    const { company, membership } = await this.assertCompanyAccess(companyId, userId);
    this.assertCartMutation(membership.role);
    const currency = this.resolveCartCurrency(company, dto.currency);
    const variant = await this.assertVariant(dto.variantId);
    this.assertCartVariant(variant, dto.quantity);
    await this.withTransaction(async (tx) => {
      const cart = await this.getOrCreateCart(tx, companyId, userId, currency);
      const where = { cartId_variantId: { cartId: cart.id, variantId: variant.id } };
      await tx.b2bCartLine.upsert({ where, update: { quantity: { increment: dto.quantity } }, create: { cartId: cart.id, variantId: variant.id, quantity: dto.quantity } });
      const updated = await tx.b2bCartLine.findUnique({ where });
      this.assertCartVariant(variant, updated?.quantity ?? 0);
    });
    return this.getCart(companyId, userId, { currency });
  }

  async updateCartLine(companyId: string, userId: string, variantId: string, dto: SaveB2bCartLineDto) {
    const { company, membership } = await this.assertCompanyAccess(companyId, userId);
    this.assertCartMutation(membership.role);
    if (dto.variantId !== variantId) throw new BadRequestException('The cart line variant does not match the request path.');
    const currency = this.resolveCartCurrency(company, dto.currency);
    const variant = await this.assertVariant(variantId);
    this.assertCartVariant(variant, dto.quantity);
    await this.withTransaction(async (tx) => {
      const cart = await tx.b2bCart.findUnique({ where: { companyId_userId_currency: { companyId, userId, currency } } });
      if (!cart) throw new NotFoundException('The B2B cart was not found.');
      const line = await tx.b2bCartLine.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
      if (!line) throw new NotFoundException('The B2B cart line was not found.');
      await tx.b2bCartLine.update({ where: { id: line.id }, data: { quantity: dto.quantity } });
    });
    return this.getCart(companyId, userId, { currency });
  }

  async removeCartLine(companyId: string, userId: string, variantId: string, query: B2bCartQueryDto = {}) {
    const { company, membership } = await this.assertCompanyAccess(companyId, userId);
    this.assertCartMutation(membership.role);
    const currency = this.resolveCartCurrency(company, query.currency);
    await this.withTransaction(async (tx) => {
      const cart = await tx.b2bCart.findUnique({ where: { companyId_userId_currency: { companyId, userId, currency } } });
      if (cart) await tx.b2bCartLine.deleteMany({ where: { cartId: cart.id, variantId } });
    });
    return this.getCart(companyId, userId, { currency });
  }

  async clearCart(companyId: string, userId: string, query: B2bCartQueryDto = {}) {
    const { company, membership } = await this.assertCompanyAccess(companyId, userId);
    this.assertCartMutation(membership.role);
    const currency = this.resolveCartCurrency(company, query.currency);
    await this.withTransaction(async (tx) => {
      const cart = await tx.b2bCart.findUnique({ where: { companyId_userId_currency: { companyId, userId, currency } } });
      if (cart) await tx.b2bCartLine.deleteMany({ where: { cartId: cart.id } });
    });
    return this.getCart(companyId, userId, { currency });
  }

  async createPurchaseRequest(companyId: string, userId: string, dto: CreateB2bPurchaseRequestDto) {
    const { company, membership } = await this.assertCompanyAccess(companyId, userId);
    this.assertCartMutation(membership.role);
    const currency = this.resolveCartCurrency(company, dto.currency);
    const address = await this.assertCompanyAddress(companyId, dto.addressId);
    const cart = await this.db.b2bCart.findUnique({
      where: { companyId_userId_currency: { companyId, userId, currency } },
      include: { lines: { include: { variant: { include: { product: true } } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!cart?.lines?.length) throw new BadRequestException('Add at least one item to the B2B cart before submitting a request.');

    const quotes = await Promise.all(cart.lines.map(async (line: any) => {
      this.assertCartVariant(line.variant, line.quantity);
      return this.effectivePriceForVariant(company.customerGroupId, line.variant, line.quantity, currency);
    }));
    const shippingAddress = {
      label: address.label, recipientName: address.recipientName, phone: address.phone, line1: address.line1,
      line2: address.line2, city: address.city, region: address.region, postalCode: address.postalCode, countryCode: address.countryCode,
    };
    const request = await this.withTransaction(async (db) => {
      const created = await db.b2bPurchaseRequest.create({
        data: {
          companyId, requesterId: userId, currency, shippingAddress,
          subtotalMinor: quotes.reduce((sum, quote) => sum + quote.subtotalMinor, 0), notes: dto.notes?.trim() || null,
          lines: { create: quotes.map((quote) => ({ variantId: quote.variantId, sku: quote.sku, productName: quote.name, quantity: quote.quantity, unitPriceMinor: quote.unitPriceMinor, subtotalMinor: quote.subtotalMinor, priceSource: quote.source })) },
        },
        include: { lines: true },
      });
      await db.b2bCartLine.deleteMany({ where: { cartId: cart.id } });
      return created;
    });
    await this.recordAudit('b2b.purchase_request_submitted', 'b2b_purchase_request', request.id, userId, { companyId, subtotalMinor: request.subtotalMinor });
    return request;
  }

  async listPurchaseRequests(companyId: string, userId: string, query: B2bPurchaseRequestQueryDto = {}) {
    const { membership } = await this.assertCompanyAccess(companyId, userId);
    const canManage = membership.role === 'OWNER' || membership.role === 'ADMIN';
    return this.db.b2bPurchaseRequest.findMany({
      where: { companyId, ...(query.status ? { status: query.status } : {}), ...(canManage ? {} : { requesterId: userId }) },
      include: { lines: true, requester: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPurchaseRequest(companyId: string, requestId: string, userId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, userId);
    const canManage = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const request = await this.db.b2bPurchaseRequest.findFirst({
      where: { id: requestId, companyId, ...(canManage ? {} : { requesterId: userId }) },
      include: { lines: { orderBy: { id: 'asc' } }, requester: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!request) throw new NotFoundException('Purchase request was not found.');
    return request;
  }

  async reviewPurchaseRequest(companyId: string, requestId: string, dto: ReviewB2bPurchaseRequestDto, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    this.assertCompanyAdmin(membership.role);
    const request = await this.db.b2bPurchaseRequest.findFirst({ where: { id: requestId, companyId } });
    if (!request) throw new NotFoundException('Purchase request was not found.');
    if (request.status !== 'SUBMITTED') throw new ConflictException('Only submitted purchase requests can be reviewed.');
    if (dto.decision === 'REJECTED' && !dto.reason?.trim()) throw new BadRequestException('A rejection reason is required.');
    const updated = await this.db.b2bPurchaseRequest.update({ where: { id: requestId }, data: { status: dto.decision, rejectionReason: dto.decision === 'REJECTED' ? dto.reason!.trim() : null, reviewedById: actorId, reviewedAt: new Date() }, include: { lines: true } });
    await this.recordAudit(`b2b.purchase_request_${dto.decision.toLowerCase()}`, 'b2b_purchase_request', requestId, actorId, { companyId, reason: dto.reason?.trim() });
    return updated;
  }

  async cancelPurchaseRequest(companyId: string, requestId: string, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    const request = await this.db.b2bPurchaseRequest.findFirst({ where: { id: requestId, companyId, ...(membership.role === 'OWNER' || membership.role === 'ADMIN' ? {} : { requesterId: actorId }) } });
    if (!request) throw new NotFoundException('Purchase request was not found.');
    if (request.status !== 'SUBMITTED') throw new ConflictException('Only submitted purchase requests can be cancelled.');
    const updated = await this.db.b2bPurchaseRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' }, include: { lines: true } });
    await this.recordAudit('b2b.purchase_request_cancelled', 'b2b_purchase_request', requestId, actorId, { companyId });
    return updated;
  }

  async createB2bOrder(companyId: string, requestId: string, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    this.assertCartMutation(membership.role);
    const canCreate = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const request = await this.db.b2bPurchaseRequest.findFirst({ where: { id: requestId, companyId, ...(canCreate ? {} : { requesterId: actorId }) }, include: { lines: { include: { variant: true } }, order: true } });
    if (!request) throw new NotFoundException('Purchase request was not found.');
    if (request.status !== 'APPROVED') throw new ConflictException('Only approved purchase requests can become orders.');
    if (request.order) return request.order;
    for (const line of request.lines) {
      if (!line.variant.isActive || line.quantity > line.variant.stockQty) throw new BadRequestException(`The requested stock for ${line.sku} is no longer available.`);
    }
    const number = `B2B-${Date.now().toString(36).toUpperCase()}-${request.id.slice(-6).toUpperCase()}`;
    let order: any;
    try {
      order = await this.withTransaction(async (db) => db.b2bOrder.create({
        data: {
          number, companyId, purchaseRequestId: request.id, createdById: actorId, status: 'PENDING', paymentStatus: 'PENDING_MANUAL', currency: request.currency,
          shippingAddress: request.shippingAddress, subtotalMinor: request.subtotalMinor, shippingMinor: 0, totalMinor: request.subtotalMinor,
          lines: { create: request.lines.map((line: any) => ({ variantId: line.variantId, sku: line.sku, productName: line.productName, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, subtotalMinor: line.subtotalMinor })) },
        },
        include: { lines: true },
      }));
    } catch (error) {
      if ((error as any)?.code === 'P2002') return this.db.b2bOrder.findUnique({ where: { purchaseRequestId: request.id }, include: { lines: true } });
      throw error;
    }
    await this.recordAudit('b2b.order_created', 'b2b_order', order.id, actorId, { companyId, purchaseRequestId: request.id, paymentStatus: 'PENDING_MANUAL' });
    return order;
  }

  async listB2bOrders(companyId: string, userId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, userId);
    const canManage = membership.role === 'OWNER' || membership.role === 'ADMIN';
    return this.db.b2bOrder.findMany({ where: { companyId, ...(canManage ? {} : { createdById: userId }) }, include: { lines: true, purchaseRequest: { select: { id: true, status: true } }, createdBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async getB2bOrder(companyId: string, orderId: string, userId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, userId);
    const canManage = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const order = await this.db.b2bOrder.findFirst({ where: { id: orderId, companyId, ...(canManage ? {} : { createdById: userId }) }, include: { lines: true, purchaseRequest: { select: { id: true, status: true } }, createdBy: { select: { id: true, name: true, email: true } } } });
    if (!order) throw new NotFoundException('B2B order was not found.');
    return order;
  }

  async listB2bOrdersForStaff() {
    return this.db.b2bOrder.findMany({ include: { lines: true, company: { select: { id: true, name: true, slug: true } }, createdBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async updateB2bOrderStatus(orderId: string, status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED', actorId: string) {
    const order = await this.db.b2bOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('B2B order was not found.');
    if (order.status === 'CANCELLED' || order.status === 'DELIVERED') throw new ConflictException('A completed B2B order cannot be changed.');
    if (status === 'PENDING' && order.status !== 'PENDING') throw new BadRequestException('B2B orders cannot move back to pending.');
    const updated = await this.db.b2bOrder.update({ where: { id: orderId }, data: { status }, include: { lines: true } });
    await this.recordAudit('b2b.order_status_updated', 'b2b_order', orderId, actorId, { from: order.status, to: status });
    return updated;
  }

  private async effectivePriceForVariant(customerGroupId: string | null | undefined, variant: any, quantity: number, currency: string, enforceQuantity = true) {
    if (enforceQuantity && (!Number.isInteger(quantity) || quantity < variant.minimumOrderQty || (quantity - variant.minimumOrderQty) % variant.quantityIncrement !== 0)) throw new BadRequestException(`Quantity must be at least ${variant.minimumOrderQty} and increase by ${variant.quantityIncrement}.`);
    const now = new Date(); let priceMinor = this.priceOfVariant(variant); let source: 'variant' | 'price_list' | 'tier' = 'variant'; let appliedPriceList: any = null; let appliedItem: any = null;
    if (customerGroupId) {
      const lists = await this.db.priceList.findMany({ where: { customerGroupId, currency, isActive: true }, include: { items: { where: { variantId: variant.id }, include: { tiers: true } } } });
      const valid = lists.filter((list: any) => (!list.startsAt || list.startsAt <= now) && (!list.endsAt || list.endsAt >= now) && list.items.length).sort((a: any, b: any) => (b.priority - a.priority) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || String(b.id).localeCompare(String(a.id)));
      appliedPriceList = valid[0] ?? null; appliedItem = appliedPriceList?.items[0] ?? null;
      if (appliedItem) { priceMinor = appliedItem.priceMinor; source = 'price_list'; const tiers = [...(appliedItem.tiers ?? [])].filter((tier: any) => tier.minimumQuantity <= quantity).sort((a: any, b: any) => (b.minimumQuantity - a.minimumQuantity) || String(b.id).localeCompare(String(a.id))); if (tiers[0]) { priceMinor = tiers[0].unitPriceMinor; source = 'tier'; } }
    }
    return { variantId: variant.id, sku: variant.sku, name: variant.name, product: variant.product, currency, unitPriceMinor: priceMinor, quantity, subtotalMinor: priceMinor * quantity, source, priceListId: appliedPriceList?.id ?? null, priceListItemId: appliedItem?.id ?? null, minimumOrderQty: variant.minimumOrderQty, packSize: variant.packSize, quantityIncrement: variant.quantityIncrement, stockQty: variant.stockQty };
  }

  private resolveCartCurrency(company: any, currency?: string) {
    return this.normalizeCurrency((currency ?? company.customerGroup?.currency ?? 'USD').trim());
  }

  private assertCartMutation(role: string) {
    if (role === 'VIEWER') throw new ForbiddenException('Viewers can view the B2B cart but cannot change it.');
  }

  private cartQuantityError(variant: any, quantity: number) {
    if (!variant.isActive || variant.product?.isActive === false) return 'This variant is no longer available.';
    if (!Number.isInteger(quantity) || quantity < variant.minimumOrderQty || (quantity - variant.minimumOrderQty) % variant.quantityIncrement !== 0) return `Quantity must be at least ${variant.minimumOrderQty} and increase by ${variant.quantityIncrement}.`;
    if (quantity > variant.stockQty) return `Only ${variant.stockQty} units are currently available.`;
    return null;
  }

  private assertCartVariant(variant: any, quantity: number) {
    const error = this.cartQuantityError(variant, quantity);
    if (error) throw new BadRequestException(error);
  }

  private async formatCart(cart: any, company: any, companyId: string, currency: string) {
    const lines = await Promise.all((cart?.lines ?? []).map(async (line: any) => {
      const validationError = this.cartQuantityError(line.variant, line.quantity);
      const quote = await this.effectivePriceForVariant(company.customerGroupId, line.variant, line.quantity, currency, false);
      return { ...quote, lineId: line.id, valid: !validationError, validationError };
    }));
    return { id: cart?.id ?? null, companyId, currency, lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0), subtotalMinor: lines.reduce((sum, line) => sum + (line.valid ? line.subtotalMinor : 0), 0), hasInvalidLines: lines.some((line) => !line.valid), updatedAt: cart?.updatedAt ?? null };
  }

  private async getOrCreateCart(db: Db, companyId: string, userId: string, currency: string) {
    const where = { companyId_userId_currency: { companyId, userId, currency } };
    const existing = await db.b2bCart.findUnique({ where });
    if (existing) return existing;
    try { return await db.b2bCart.create({ data: { companyId, userId, currency } }); } catch (error) {
      if ((error as any)?.code === 'P2002') return db.b2bCart.findUniqueOrThrow({ where });
      throw error;
    }
  }

  private withTransaction<T>(callback: (db: Db) => Promise<T>) {
    return typeof this.db.$transaction === 'function' ? this.db.$transaction(callback) : callback(this.db);
  }

  // Company administration is deliberately kept in this service so all B2B
  // catalogue requests share the same membership boundary and Prisma client.
  async createCompany(dto: CreateCompanyDto, actorId: string) {
    const slug = (dto.slug ?? dto.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    if (!slug) throw new BadRequestException('A valid company slug is required.');
    try {
      const company = await this.db.company.create({ data: { name: dto.name.trim(), slug, legalName: dto.legalName?.trim(), taxRegistrationNumber: dto.taxRegistrationNumber?.trim(), customerGroupId: dto.customerGroupId, status: 'ACTIVE' } });
      await this.db.companyMembership.create({ data: { companyId: company.id, userId: actorId, role: 'OWNER', status: 'ACTIVE' } });
      await this.recordAudit('b2b.company_created', 'company', company.id, actorId, { name: company.name, slug });
      return this.db.company.findUnique({ where: { id: company.id }, include: { memberships: { include: { user: { select: { id: true, email: true, name: true } } } } } });
    } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async getCompanyForStaff(companyId: string) {
    const company = await this.db.company.findUnique({ where: { id: companyId }, include: { memberships: { include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: 'asc' } } } });
    if (!company) throw new NotFoundException('Company not found.');
    return company;
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto, actorId: string) {
    await this.requireCompany(companyId);
    try {
      const company = await this.db.company.update({ where: { id: companyId }, data: { ...dto, name: dto.name?.trim(), legalName: dto.legalName?.trim(), taxRegistrationNumber: dto.taxRegistrationNumber?.trim() } });
      await this.recordAudit('b2b.company_updated', 'company', companyId, actorId, { changes: dto });
      return company;
    } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async archiveCompany(companyId: string, actorId: string) {
    await this.requireCompany(companyId);
    const company = await this.db.company.update({ where: { id: companyId }, data: { status: 'ARCHIVED' } });
    await this.recordAudit('b2b.company_archived', 'company', companyId, actorId);
    return company;
  }

  async listMemberships(companyId: string) {
    await this.requireCompany(companyId);
    return this.db.companyMembership.findMany({ where: { companyId, status: { not: 'REMOVED' } }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: 'asc' } });
  }

  async addMember(companyId: string, dto: AddCompanyMemberDto, actorId: string) {
    await this.requireCompany(companyId);
    const user = dto.userId
      ? await this.db.user.findUnique({ where: { id: dto.userId }, select: { id: true, email: true, name: true } })
      : dto.email ? await this.db.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true, email: true, name: true } }) : null;
    if (!user) throw new NotFoundException('User not found.');
    const existing = await this.db.companyMembership.findFirst({ where: { companyId, userId: user.id } });
    if (existing && existing.status !== 'REMOVED') throw new ConflictException('User is already a member of this company.');
    try {
      const membership = existing
        ? await this.db.companyMembership.update({ where: { id: existing.id }, data: { role: dto.role, status: 'ACTIVE' }, include: { user: { select: { id: true, email: true, name: true } } } })
        : await this.db.companyMembership.create({ data: { companyId, userId: user.id, role: dto.role, status: 'ACTIVE' }, include: { user: { select: { id: true, email: true, name: true } } } });
      await this.recordAudit('b2b.membership_created', 'company_membership', membership.id, actorId, { companyId, userId: user.id, role: dto.role });
      return membership;
    } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async updateMember(companyId: string, membershipId: string, dto: UpdateCompanyMemberDto, actorId: string) {
    const membership = await this.requireMembership(companyId, membershipId);
    if ((dto.role && dto.role !== 'OWNER') || dto.status === 'SUSPENDED' || dto.status === 'REMOVED') {
      if (membership.role === 'OWNER') await this.ensureNotLastOwner(companyId, membershipId);
    }
    const updated = await this.db.companyMembership.update({ where: { id: membershipId }, data: { ...dto }, include: { user: { select: { id: true, email: true, name: true } } } });
    await this.recordAudit('b2b.membership_updated', 'company_membership', membershipId, actorId, { companyId, changes: dto });
    return updated;
  }

  async removeMember(companyId: string, membershipId: string, actorId: string) {
    const membership = await this.requireMembership(companyId, membershipId);
    if (membership.role === 'OWNER') await this.ensureNotLastOwner(companyId, membershipId);
    const updated = await this.db.companyMembership.update({ where: { id: membershipId }, data: { status: 'REMOVED' } });
    await this.recordAudit('b2b.membership_removed', 'company_membership', membershipId, actorId, { companyId, userId: membership.userId });
    return updated;
  }

  async getMyCompany(userId: string, companyId: string) {
    const membership = await this.requireActiveMembership(userId, companyId);
    const company = await this.db.company.findUnique({ where: { id: companyId } });
    if (!company || company.status !== 'ACTIVE') throw new NotFoundException('Company not found.');
    return { company, membership: { id: membership.id, role: membership.role, status: membership.status } };
  }

  async companyAddresses(companyId: string, userId: string) {
    await this.assertCompanyAccess(companyId, userId);
    return this.db.companyAddress.findMany({
      where: { companyId, archivedAt: null },
      orderBy: [{ isDefaultShipping: 'desc' }, { isDefaultBilling: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createCompanyAddress(companyId: string, dto: SaveCompanyAddressDto, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    this.assertCompanyAdmin(membership.role);
    const data = this.normalizeCompanyAddress(dto);
    const address = await this.withTransaction(async (db) => {
      await this.clearCompanyDefaults(db, companyId, data.isDefaultShipping, data.isDefaultBilling);
      return db.companyAddress.create({ data: { companyId, ...data } });
    });
    await this.recordAudit('b2b.company_address_created', 'company_address', address.id, actorId, { companyId });
    return address;
  }

  async updateCompanyAddress(companyId: string, addressId: string, dto: SaveCompanyAddressDto, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    this.assertCompanyAdmin(membership.role);
    await this.assertCompanyAddress(companyId, addressId);
    const data = this.normalizeCompanyAddress(dto);
    const address = await this.withTransaction(async (db) => {
      await this.clearCompanyDefaults(db, companyId, data.isDefaultShipping, data.isDefaultBilling, addressId);
      return db.companyAddress.update({ where: { id: addressId }, data });
    });
    await this.recordAudit('b2b.company_address_updated', 'company_address', addressId, actorId, { companyId });
    return address;
  }

  async archiveCompanyAddress(companyId: string, addressId: string, actorId: string) {
    const { membership } = await this.assertCompanyAccess(companyId, actorId);
    this.assertCompanyAdmin(membership.role);
    await this.assertCompanyAddress(companyId, addressId);
    const address = await this.db.companyAddress.update({ where: { id: addressId }, data: { archivedAt: new Date(), isDefaultShipping: false, isDefaultBilling: false } });
    await this.recordAudit('b2b.company_address_archived', 'company_address', addressId, actorId, { companyId });
    return address;
  }

  async requireActiveMembership(userId: string, companyId: string) {
    const membership = await this.db.companyMembership.findFirst({ where: { userId, companyId, status: 'ACTIVE', company: { status: 'ACTIVE' } } });
    if (!membership) throw new NotFoundException('Company not found.');
    return membership;
  }

  private assertCompanyAdmin(role: string) {
    if (role !== 'OWNER' && role !== 'ADMIN') throw new ForbiddenException('Only company owners and admins can manage company addresses.');
  }

  private normalizeCompanyAddress(dto: SaveCompanyAddressDto) {
    const trim = (value?: string) => value?.trim() || undefined;
    return {
      label: trim(dto.label),
      recipientName: dto.recipientName.trim(),
      phone: trim(dto.phone),
      line1: dto.line1.trim(),
      line2: trim(dto.line2),
      city: dto.city.trim(),
      region: trim(dto.region),
      postalCode: dto.postalCode.trim(),
      countryCode: dto.countryCode.trim().toUpperCase(),
      isDefaultShipping: dto.isDefaultShipping ?? false,
      isDefaultBilling: dto.isDefaultBilling ?? false,
    };
  }

  private clearCompanyDefaults(db: Db, companyId: string, shipping?: boolean, billing?: boolean, exceptId?: string) {
    const updates: Promise<unknown>[] = [];
    if (shipping) updates.push(db.companyAddress.updateMany({ where: { companyId, archivedAt: null, isDefaultShipping: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefaultShipping: false } }));
    if (billing) updates.push(db.companyAddress.updateMany({ where: { companyId, archivedAt: null, isDefaultBilling: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefaultBilling: false } }));
    return Promise.all(updates);
  }

  private async assertCompanyAddress(companyId: string, addressId: string) {
    const address = await this.db.companyAddress.findFirst({ where: { id: addressId, companyId, archivedAt: null } });
    if (!address) throw new NotFoundException('Company address was not found.');
    return address;
  }

  private async requireCompany(companyId: string) {
    const company = await this.db.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found.');
    return company;
  }

  private async requireMembership(companyId: string, membershipId: string) {
    const membership = await this.db.companyMembership.findFirst({ where: { id: membershipId, companyId, status: { not: 'REMOVED' } } });
    if (!membership) throw new NotFoundException('Membership not found.');
    return membership;
  }

  private async ensureNotLastOwner(companyId: string, membershipId: string) {
    const count = await this.db.companyMembership.count({ where: { companyId, role: 'OWNER', status: 'ACTIVE', id: { not: membershipId } } });
    if (count < 1) throw new ConflictException('A company must retain at least one active owner.');
  }

  private async recordAudit(action: string, targetType: string, targetId: string, actorId: string, metadata?: Record<string, unknown>) {
    if (this.audit) await this.audit.record(action, targetType, targetId, actorId, metadata);
  }

  private async assertCustomerGroup(id: string) { const group = await this.db.customerGroup.findUnique({ where: { id } }); if (!group) throw new NotFoundException('Customer group was not found.'); return group; }
  private async assertPriceList(id: string) { const list = await this.db.priceList.findUnique({ where: { id } }); if (!list) throw new NotFoundException('Price list was not found.'); return list; }
  private async assertPriceListItem(id: string) { const item = await this.db.priceListItem.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Price list item was not found.'); return item; }
  private normalizeCurrency(value: string) { const currency = value.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO code.'); return currency; }
  private validatePriceListDates(dto: SavePriceListDto) { if (dto.startsAt && dto.endsAt && new Date(dto.startsAt) > new Date(dto.endsAt)) throw new BadRequestException('Price list start date must be before its end date.'); }
  private isNotFound(error: unknown) { return (error as any)?.code === 'P2025'; }
  private rethrowConflict(error: unknown) { if ((error as any)?.code === 'P2002') throw new ConflictException('A record with the same identifier already exists.'); if (this.isNotFound(error)) throw new NotFoundException('The requested record was not found.'); }
}
