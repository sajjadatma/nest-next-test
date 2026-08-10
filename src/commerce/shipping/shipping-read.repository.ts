import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ShippingMethodRecord = {
  id: string;
  label: string;
  description: string | null;
  eta: string;
  priceMinor: number;
};

@Injectable()
export class ShippingReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(): Promise<ShippingMethodRecord[]> {
    return this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      select: { code: true, label: true, description: true, eta: true, priceMinor: true },
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
    }).then((methods) => methods.map(({ code, ...method }) => ({ id: code, ...method })));
  }
}
