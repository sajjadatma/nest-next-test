import { Injectable } from '@nestjs/common';
import { CartStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CartScope = {
  merchantId: string;
  customerId?: string;
  externalUserId?: string;
  conversationId?: string;
};

export type CartItemView = {
  variantId: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  variant: { id: string; sku: string; priceMinor: number; currency: string; stockQty: number; product: { id: string; name: string } };
};

export type CartView = {
  id: string;
  merchantId: string;
  status: CartStatus;
  subtotalMinor: number;
  currency: string;
  expiresAt: Date | null;
  items: CartItemView[];
};

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(scope: CartScope) {
    return this.prisma.cart.create({ data: scope });
  }

  findScoped(merchantId: string, cartId: string): Promise<CartView | null> {
    return this.prisma.cart.findFirst({
      where: { id: cartId, merchantId },
      select: {
        id: true, merchantId: true, status: true, subtotalMinor: true, currency: true, expiresAt: true,
        items: {
          orderBy: { variantId: 'asc' },
          select: {
            variantId: true, quantity: true, unitPriceMinor: true, currency: true,
            variant: { select: { id: true, sku: true, priceMinor: true, currency: true, stockQty: true, product: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  }

  async addVerifiedItem(merchantId: string, cartId: string, variantId: string, quantity: number): Promise<{ kind: 'ok'; cart: CartView } | { kind: 'cart_missing' } | { kind: 'variant_missing' } | { kind: 'insufficient_stock' }> {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({ where: { id: cartId, merchantId, status: CartStatus.ACTIVE }, select: { id: true } });
      if (!cart) return { kind: 'cart_missing' } as const;
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, product: { merchantId, isActive: true } },
        select: { id: true, priceMinor: true, currency: true, stockQty: true },
      });
      if (!variant) return { kind: 'variant_missing' } as const;
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } }, select: { quantity: true } });
      if ((existing?.quantity ?? 0) + quantity > variant.stockQty) return { kind: 'insufficient_stock' } as const;
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        create: { cartId, variantId, quantity, unitPriceMinor: variant.priceMinor, currency: variant.currency },
        update: { quantity: { increment: quantity }, unitPriceMinor: variant.priceMinor, currency: variant.currency },
      });
      const items = await tx.cartItem.findMany({ where: { cartId }, select: { quantity: true, unitPriceMinor: true, currency: true } });
      const subtotalMinor = items.reduce((total, item) => total + item.quantity * item.unitPriceMinor, 0);
      const currency = items[0]?.currency ?? 'USD';
      await tx.cart.update({ where: { id: cartId }, data: { subtotalMinor, currency } });
      const updated = await this.findScopedWith(tx, merchantId, cartId);
      return updated ? { kind: 'ok', cart: updated } as const : { kind: 'cart_missing' } as const;
    });
  }

  async prepareCheckout(merchantId: string, cartId: string): Promise<{ kind: 'ok'; cart: CartView } | { kind: 'cart_missing' } | { kind: 'cart_empty' } | { kind: 'insufficient_stock' }> {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.findScopedWith(tx, merchantId, cartId);
      if (!cart || cart.status !== CartStatus.ACTIVE) return { kind: 'cart_missing' } as const;
      if (cart.items.length === 0) return { kind: 'cart_empty' } as const;
      if (cart.items.some((item) => item.quantity > item.variant.stockQty)) return { kind: 'insufficient_stock' } as const;
      const subtotalMinor = cart.items.reduce((total, item) => total + item.quantity * item.variant.priceMinor, 0);
      const currency = cart.items[0].variant.currency;
      await Promise.all(cart.items.map((item) => tx.cartItem.update({ where: { cartId_variantId: { cartId, variantId: item.variantId } }, data: { unitPriceMinor: item.variant.priceMinor, currency: item.variant.currency } })));
      await tx.cart.update({ where: { id: cartId }, data: { subtotalMinor, currency } });
      const updated = await this.findScopedWith(tx, merchantId, cartId);
      return updated ? { kind: 'ok', cart: updated } as const : { kind: 'cart_missing' } as const;
    });
  }

  markHandedOff(merchantId: string, cartId: string, checkoutTokenHash: string, expiresAt: Date) {
    return this.prisma.cart.updateMany({ where: { id: cartId, merchantId, status: CartStatus.ACTIVE }, data: { status: CartStatus.HANDED_OFF, checkoutTokenHash, expiresAt } });
  }

  expire(now: Date) {
    return this.prisma.cart.updateMany({ where: { status: CartStatus.HANDED_OFF, expiresAt: { lte: now } }, data: { status: CartStatus.EXPIRED } });
  }

  private findScopedWith(client: Pick<PrismaService, 'cart'>, merchantId: string, cartId: string): Promise<CartView | null> {
    return client.cart.findFirst({
      where: { id: cartId, merchantId },
      select: {
        id: true, merchantId: true, status: true, subtotalMinor: true, currency: true, expiresAt: true,
        items: { orderBy: { variantId: 'asc' }, select: { variantId: true, quantity: true, unitPriceMinor: true, currency: true, variant: { select: { id: true, sku: true, priceMinor: true, currency: true, stockQty: true, product: { select: { id: true, name: true } } } } } },
      },
    });
  }
}
