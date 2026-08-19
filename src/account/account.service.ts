import { Injectable, NotFoundException } from '@nestjs/common';
import { AddressType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountOrdersQueryDto, RecordConsentDto, RequestDeletionDto, SaveAddressDto, UpdateAccountProfileDto, UpdatePreferencesDto } from './dto/account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerifiedAt: true, createdAt: true, profile: true, preferences: true } });
    return { ...user, profile: user.profile ?? { phone: null, avatarUrl: null, locale: 'en-US', timezone: 'UTC' }, preferences: user.preferences ?? { emailOrderUpdates: true, emailMarketing: false, smsOrderUpdates: false, preferredCurrency: 'USD' } };
  }

  async updateProfile(userId: string, dto: UpdateAccountProfileDto) {
    await this.prisma.userProfile.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
    await this.audit.record('account.profile_updated', 'user_profile', userId, userId);
    return this.profile(userId);
  }

  addresses(userId: string) { return this.prisma.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefaultShipping: 'desc' }, { isDefaultBilling: 'desc' }, { updatedAt: 'desc' }] }); }

  async createAddress(userId: string, dto: SaveAddressDto) {
    const data = this.addressData(dto);
    const address = await this.prisma.$transaction(async (tx) => {
      await this.clearDefaults(tx, userId, dto);
      return tx.address.create({ data: { ...data, userId } });
    });
    await this.audit.record('account.address_created', 'address', address.id, userId);
    return address;
  }

  async updateAddress(userId: string, id: string, dto: SaveAddressDto) {
    await this.requireAddress(userId, id);
    const address = await this.prisma.$transaction(async (tx) => {
      await this.clearDefaults(tx, userId, dto, id);
      return tx.address.update({ where: { id }, data: this.addressData(dto) });
    });
    await this.audit.record('account.address_updated', 'address', id, userId);
    return address;
  }

  async deleteAddress(userId: string, id: string) {
    await this.requireAddress(userId, id);
    await this.prisma.address.update({ where: { id }, data: { deletedAt: new Date(), isDefaultBilling: false, isDefaultShipping: false } });
    await this.audit.record('account.address_deleted', 'address', id, userId);
    return { deleted: true };
  }

  async preferences(userId: string) { return this.prisma.customerPreference.upsert({ where: { userId }, create: { userId }, update: {} }); }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const result = await this.prisma.customerPreference.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
    await this.audit.record('account.preferences_updated', 'customer_preference', result.id, userId);
    return result;
  }

  async recordConsent(userId: string, dto: RecordConsentDto) {
    const result = await this.prisma.consentRecord.create({ data: { userId, type: dto.type.trim(), version: dto.version.trim(), granted: dto.granted, revokedAt: dto.granted ? null : new Date() } });
    await this.audit.record('account.consent_updated', 'consent_record', result.id, userId, { type: dto.type, version: dto.version, granted: dto.granted });
    return result;
  }

  consents(userId: string) { return this.prisma.consentRecord.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }); }

  async orders(userId: string, query: AccountOrdersQueryDto) {
    const page = Math.max(1, query.page ?? 1); const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where = { customerId: userId };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: { items: true, shipments: { orderBy: { createdAt: 'desc' } }, statusEvents: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, methodType: true, amountMinor: true, currency: true, paidAt: true, refundedAt: true, createdAt: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.order.count({ where }),
    ]);
    return { items, page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async order(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: userId },
      include: {
        items: true,
        shipments: { orderBy: { createdAt: 'desc' } },
        statusEvents: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, methodType: true, amountMinor: true, currency: true, paidAt: true, createdAt: true } },
      },
    });
    if (!order) throw new NotFoundException('Order was not found.');
    return order;
  }

  payments(userId: string) { return this.prisma.payment.findMany({ where: { customerId: userId }, select: { id: true, orderId: true, provider: true, methodType: true, status: true, amountMinor: true, currency: true, paidAt: true, refundedAt: true, createdAt: true, events: { select: { id: true, type: true, amountMinor: true, createdAt: true }, orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } }); }

  sessions(userId: string) { return this.prisma.refreshToken.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new NotFoundException('Session was not found.');
    await this.audit.record('account.session_revoked', 'refresh_token', sessionId, userId);
    return { revoked: true };
  }

  async requestDeletion(userId: string, dto: RequestDeletionDto) {
    const existing = await this.prisma.accountDeletionRequest.findFirst({ where: { userId, status: 'REQUESTED' } });
    if (existing) return existing;
    const request = await this.prisma.accountDeletionRequest.create({ data: { userId, reason: dto.reason?.trim() || null } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record('account.deletion_requested', 'user', userId, userId);
    return request;
  }

  async cancelDeletion(userId: string) {
    const result = await this.prisma.accountDeletionRequest.updateMany({ where: { userId, status: 'REQUESTED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    if (!result.count) throw new NotFoundException('No active deletion request exists.');
    await this.audit.record('account.deletion_cancelled', 'user', userId, userId);
    return { cancelled: true };
  }

  async exportData(userId: string) {
    const [profile, addresses, preferences, consents, orders, payments] = await Promise.all([this.profile(userId), this.addresses(userId), this.preferences(userId), this.consents(userId), this.orders(userId, { page: 1, pageSize: 50 }), this.payments(userId)]);
    await this.audit.record('account.data_exported', 'user', userId, userId);
    return { exportedAt: new Date().toISOString(), profile, addresses, preferences, consents, orders, payments };
  }

  private addressData(dto: SaveAddressDto): Omit<Prisma.AddressUncheckedCreateInput, 'userId'> {
    return { label: dto.label?.trim() || null, type: dto.type as AddressType, recipientName: dto.recipientName.trim(), phone: dto.phone?.trim() || null, line1: dto.line1.trim(), line2: dto.line2?.trim() || null, city: dto.city.trim(), region: dto.region?.trim() || null, postalCode: dto.postalCode.trim(), countryCode: dto.countryCode.trim().toUpperCase(), isDefaultShipping: dto.isDefaultShipping ?? false, isDefaultBilling: dto.isDefaultBilling ?? false };
  }

  private async clearDefaults(tx: Prisma.TransactionClient, userId: string, dto: SaveAddressDto, id?: string) {
    if (dto.isDefaultShipping) await tx.address.updateMany({ where: { userId, deletedAt: null, ...(id ? { id: { not: id } } : {}) }, data: { isDefaultShipping: false } });
    if (dto.isDefaultBilling) await tx.address.updateMany({ where: { userId, deletedAt: null, ...(id ? { id: { not: id } } : {}) }, data: { isDefaultBilling: false } });
  }

  private async requireAddress(userId: string, id: string) { const address = await this.prisma.address.findFirst({ where: { id, userId, deletedAt: null } }); if (!address) throw new NotFoundException('Address was not found.'); return address; }
}
