import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SaveCustomerGroupDto, SavePriceListDto, SavePriceListItemDto, SavePriceTierDto, SaveVariantDto } from './dto/b2b.dto';
import { AddCompanyMemberDto, CreateCompanyDto, UpdateCompanyDto, UpdateCompanyMemberDto } from './dto/company.dto';

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

  private priceOfVariant(variant: any) { return variant.priceMinor ?? variant.basePriceMinor ?? 0; }

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
      return await this.db.productVariant.create({ data: { productId, sku, name: dto.name.trim(), options: this.parseOptions(dto.options), priceMinor: dto.basePriceMinor, currency: (dto.currency ?? product.currency).trim().toUpperCase(), ...normalized, isActive: dto.isActive ?? true, position: dto.position ?? 0 }, include: { product: true } });
    } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async updateVariant(id: string, dto: SaveVariantDto) {
    await this.assertVariant(id); const normalized = { stockQty: dto.stockQty ?? 0, lowStockThreshold: dto.lowStockThreshold ?? 5, minimumOrderQty: dto.minimumOrderQty ?? 1, packSize: dto.packSize ?? 1, quantityIncrement: dto.quantityIncrement ?? 1 }; const sku = this.normalizeSku(dto.sku); this.validateQuantityRules(normalized);
    try { return await this.db.productVariant.update({ where: { id }, data: { sku, name: dto.name.trim(), options: this.parseOptions(dto.options), priceMinor: dto.basePriceMinor, ...(dto.currency === undefined ? {} : { currency: dto.currency.trim().toUpperCase() }), ...normalized, ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }), ...(dto.position === undefined ? {} : { position: dto.position }) }, include: { product: true } }); } catch (error) { this.rethrowConflict(error); throw error; }
  }

  async archiveVariant(id: string) { await this.assertVariant(id); await this.db.productVariant.update({ where: { id }, data: { isActive: false } }); return { archived: true }; }

  async customerGroups() { return this.db.customerGroup.findMany({ orderBy: [{ name: 'asc' }] }); }

  async createCustomerGroup(dto: SaveCustomerGroupDto) { try { return await this.db.customerGroup.create({ data: { name: dto.name.trim(), code: this.normalizeCode(dto.code), isActive: dto.isActive ?? true } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async updateCustomerGroup(id: string, dto: SaveCustomerGroupDto) { try { return await this.db.customerGroup.update({ where: { id }, data: { name: dto.name.trim(), code: this.normalizeCode(dto.code), ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) } }); } catch (error) { if (this.isNotFound(error)) throw new NotFoundException('Customer group was not found.'); this.rethrowConflict(error); throw error; } }

  async priceLists(customerGroupId?: string) { return this.db.priceList.findMany({ where: customerGroupId ? { customerGroupId } : undefined, include: { customerGroup: true, items: { include: { variant: { include: { product: true } }, tiers: { orderBy: { minQuantity: 'asc' } } } } }, orderBy: [{ priority: 'desc' }, { name: 'asc' }] }); }

  async createPriceList(dto: SavePriceListDto) { await this.assertCustomerGroup(dto.customerGroupId); this.validatePriceListDates(dto); return this.db.priceList.create({ data: { name: dto.name.trim(), code: this.normalizeCode(dto.code ?? dto.name), currency: this.normalizeCurrency(dto.currency), priority: dto.priority ?? 0, isActive: dto.isActive ?? true, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, endsAt: dto.endsAt ? new Date(dto.endsAt) : null, customerGroupId: dto.customerGroupId }, include: { customerGroup: true } }); }

  async updatePriceList(id: string, dto: SavePriceListDto) { await this.assertCustomerGroup(dto.customerGroupId); this.validatePriceListDates(dto); try { return await this.db.priceList.update({ where: { id }, data: { name: dto.name.trim(), ...(dto.code === undefined ? {} : { code: this.normalizeCode(dto.code) }), currency: this.normalizeCurrency(dto.currency), priority: dto.priority ?? 0, isActive: dto.isActive ?? true, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, endsAt: dto.endsAt ? new Date(dto.endsAt) : null, customerGroupId: dto.customerGroupId }, include: { customerGroup: true } }); } catch (error) { if (this.isNotFound(error)) throw new NotFoundException('Price list was not found.'); this.rethrowConflict(error); throw error; } }

  async archivePriceList(id: string) { await this.assertPriceList(id); await this.db.priceList.update({ where: { id }, data: { isActive: false } }); return { archived: true }; }

  async savePriceListItem(dto: SavePriceListItemDto) { await this.assertVariant(dto.variantId); await this.assertPriceList(dto.priceListId); try { return await this.db.priceListItem.upsert({ where: { priceListId_variantId: { priceListId: dto.priceListId, variantId: dto.variantId } }, update: { priceMinor: dto.priceMinor }, create: { priceListId: dto.priceListId, variantId: dto.variantId, priceMinor: dto.priceMinor }, include: { tiers: true, variant: true } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async savePriceTier(dto: SavePriceTierDto) { if (dto.minimumQuantity < 1 || dto.unitPriceMinor < 0) throw new BadRequestException('Tier quantity and price are invalid.'); await this.assertPriceListItem(dto.priceListItemId); try { return await this.db.priceTier.upsert({ where: { priceListItemId_minQuantity: { priceListItemId: dto.priceListItemId, minQuantity: dto.minimumQuantity } }, update: { priceMinor: dto.unitPriceMinor }, create: { priceListItemId: dto.priceListItemId, minQuantity: dto.minimumQuantity, priceMinor: dto.unitPriceMinor } }); } catch (error) { this.rethrowConflict(error); throw error; } }

  async catalog(companyId: string, userId: string, query: { q?: string; currency?: string; page?: number; pageSize?: number }) {
    const { company } = await this.assertCompanyAccess(companyId, userId);
    const page = Math.max(1, query.page ?? 1); const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 24)); const q = query.q?.trim();
    const where: any = { isActive: true, product: { isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) } };
    const [items, total] = await Promise.all([this.db.productVariant.findMany({ where, include: { product: { select: { id: true, name: true, slug: true, description: true, imageUrl: true, categoryId: true, category: { select: { id: true, name: true, slug: true } } } } }, orderBy: [{ position: 'asc' }, { sku: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }), this.db.productVariant.count({ where })]);
    const data = await Promise.all(items.map((variant: any) => this.effectivePriceForVariant(company.customerGroupId, variant, 1, (query.currency ?? variant.currency ?? 'USD').toUpperCase(), false)));
    return { items: data, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), companyId, customerGroupId: company.customerGroupId ?? null };
  }

  async price(companyId: string, userId: string, variantId: string, quantity: number, currency?: string) { const { company } = await this.assertCompanyAccess(companyId, userId); const variant = await this.assertVariant(variantId); return this.effectivePriceForVariant(company.customerGroupId, variant, quantity, (currency ?? variant.currency ?? 'USD').toUpperCase()); }

  private async effectivePriceForVariant(customerGroupId: string | null | undefined, variant: any, quantity: number, currency: string, enforceQuantity = true) {
    if (enforceQuantity && (!Number.isInteger(quantity) || quantity < variant.minimumOrderQty || (quantity - variant.minimumOrderQty) % variant.quantityIncrement !== 0)) throw new BadRequestException(`Quantity must be at least ${variant.minimumOrderQty} and increase by ${variant.quantityIncrement}.`);
    const now = new Date(); let priceMinor = this.priceOfVariant(variant); let source: 'variant' | 'price_list' | 'tier' = 'variant'; let appliedPriceList: any = null; let appliedItem: any = null;
    if (customerGroupId) {
      const lists = await this.db.priceList.findMany({ where: { customerGroupId, currency, isActive: true }, include: { items: { where: { variantId: variant.id }, include: { tiers: true } } } });
      const valid = lists.filter((list: any) => (!list.startsAt || list.startsAt <= now) && (!list.endsAt || list.endsAt >= now) && list.items.length).sort((a: any, b: any) => (b.priority - a.priority) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || String(b.id).localeCompare(String(a.id)));
      appliedPriceList = valid[0] ?? null; appliedItem = appliedPriceList?.items[0] ?? null;
      if (appliedItem) { priceMinor = appliedItem.priceMinor; source = 'price_list'; const tiers = [...(appliedItem.tiers ?? [])].filter((tier: any) => (tier.minQuantity ?? tier.minimumQuantity) <= quantity).sort((a: any, b: any) => ((b.minQuantity ?? b.minimumQuantity) - (a.minQuantity ?? a.minimumQuantity)) || String(b.id).localeCompare(String(a.id))); if (tiers[0]) { priceMinor = tiers[0].priceMinor ?? tiers[0].unitPriceMinor; source = 'tier'; } }
    }
    return { variantId: variant.id, sku: variant.sku, name: variant.name, product: variant.product, currency, unitPriceMinor: priceMinor, quantity, subtotalMinor: priceMinor * quantity, source, priceListId: appliedPriceList?.id ?? null, priceListItemId: appliedItem?.id ?? null, minimumOrderQty: variant.minimumOrderQty, packSize: variant.packSize, quantityIncrement: variant.quantityIncrement, stockQty: variant.stockQty };
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

  async requireActiveMembership(userId: string, companyId: string) {
    const membership = await this.db.companyMembership.findFirst({ where: { userId, companyId, status: 'ACTIVE', company: { status: 'ACTIVE' } } });
    if (!membership) throw new NotFoundException('Company not found.');
    return membership;
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
