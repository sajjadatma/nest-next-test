import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_MERCHANT_ID, DEFAULT_MERCHANT_NAME, DEFAULT_MERCHANT_SLUG } from './merchant.constants';

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  ensureDefaultMerchant() {
    return this.prisma.merchant.upsert({
      where: { slug: DEFAULT_MERCHANT_SLUG },
      update: {},
      create: {
        id: DEFAULT_MERCHANT_ID,
        slug: DEFAULT_MERCHANT_SLUG,
        name: DEFAULT_MERCHANT_NAME,
      },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.merchant.findUnique({ where: { slug } });
  }

  async isMember(userId: string, merchantId: string) {
    return (await this.prisma.merchantMembership.count({ where: { userId, merchantId } })) > 0;
  }

  productsScoped(merchantId: string) {
    return this.prisma.product.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
