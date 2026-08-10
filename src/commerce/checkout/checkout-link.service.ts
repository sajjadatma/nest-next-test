import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CartError, CartService } from '../cart/cart.service';
import { CHECKOUT_LINK_TTL_MS, CHECKOUT_SIGNING_SECRET_ENV } from './checkout-link.constants';

export type CheckoutTokenPayload = {
  cartId: string;
  merchantId: string;
  lines: Array<{ variantId: string; quantity: number; unitPriceMinor: number; currency: string }>;
  priceSnapshotMinor: number;
  expiresAt: string;
};

export class CheckoutLinkError extends Error {
  constructor(public readonly code: 'CART_NOT_FOUND' | 'CART_EMPTY' | 'INSUFFICIENT_STOCK' | 'CHECKOUT_LINK_INVALID' | 'CHECKOUT_LINK_EXPIRED' | 'CHECKOUT_LINK_UNVERIFIABLE', message: string) {
    super(message);
  }
}

@Injectable()
export class CheckoutLinkService {
  constructor(private readonly carts: CartService) {}

  async createCheckoutLink(merchantId: string, cartId: string, actorId?: string) {
    try {
      const cart = await this.carts.prepareCheckout(merchantId, cartId);
      const expiresAt = new Date(Date.now() + CHECKOUT_LINK_TTL_MS);
      const payload: CheckoutTokenPayload = {
        cartId: cart.id,
        merchantId: cart.merchantId,
        lines: cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, currency: item.currency })),
        priceSnapshotMinor: cart.subtotalMinor,
        expiresAt: expiresAt.toISOString(),
      };
      const token = this.sign(payload);
      await this.carts.markCheckoutLink(merchantId, cartId, createHash('sha256').update(token).digest('hex'), expiresAt, actorId);
      const baseUrl = (process.env.SHOP_PUBLIC_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
      return { checkoutUrl: `${baseUrl}/shop/checkout?checkout_token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString(), cartId };
    } catch (error) {
      if (error instanceof CartError) {
        const code = error.code === 'CART_NOT_FOUND' || error.code === 'CART_EMPTY' || error.code === 'INSUFFICIENT_STOCK'
          ? error.code
          : 'CHECKOUT_LINK_UNVERIFIABLE';
        throw new CheckoutLinkError(code, error.message);
      }
      if (error instanceof CheckoutLinkError) throw error;
      throw new CheckoutLinkError('CHECKOUT_LINK_UNVERIFIABLE', 'Checkout link could not be signed safely.');
    }
  }

  async verifyCheckoutLink(token: string): Promise<CheckoutTokenPayload> {
    const [encodedPayload, suppliedSignature, ...extra] = token.split('.');
    if (!encodedPayload || !suppliedSignature || extra.length > 0) throw new CheckoutLinkError('CHECKOUT_LINK_INVALID', 'Checkout link is invalid.');
    const expectedSignature = this.signature(encodedPayload);
    const supplied = Buffer.from(suppliedSignature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new CheckoutLinkError('CHECKOUT_LINK_INVALID', 'Checkout link is invalid.');
    let payload: CheckoutTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as CheckoutTokenPayload;
    } catch {
      throw new CheckoutLinkError('CHECKOUT_LINK_INVALID', 'Checkout link is invalid.');
    }
    if (!this.validPayload(payload)) throw new CheckoutLinkError('CHECKOUT_LINK_INVALID', 'Checkout link is invalid.');
    if (new Date(payload.expiresAt).getTime() <= Date.now()) throw new CheckoutLinkError('CHECKOUT_LINK_EXPIRED', 'Checkout link has expired.');
    return payload;
  }

  private sign(payload: CheckoutTokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${this.signature(encodedPayload)}`;
  }

  private signature(encodedPayload: string) {
    return createHmac('sha256', this.signingSecret()).update(encodedPayload).digest('base64url');
  }

  private signingSecret() {
    const secret = process.env[CHECKOUT_SIGNING_SECRET_ENV] ?? process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new CheckoutLinkError('CHECKOUT_LINK_UNVERIFIABLE', 'Checkout signing secret is unavailable.');
    return secret;
  }

  private validPayload(payload: CheckoutTokenPayload): boolean {
    return typeof payload?.cartId === 'string' && payload.cartId.length > 0
      && typeof payload.merchantId === 'string' && payload.merchantId.length > 0
      && typeof payload.priceSnapshotMinor === 'number' && Number.isSafeInteger(payload.priceSnapshotMinor) && payload.priceSnapshotMinor >= 0
      && typeof payload.expiresAt === 'string' && Number.isFinite(new Date(payload.expiresAt).getTime())
      && Array.isArray(payload.lines) && payload.lines.length > 0
      && payload.lines.every((line) => typeof line.variantId === 'string' && line.variantId.length > 0
        && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 20
        && Number.isSafeInteger(line.unitPriceMinor) && line.unitPriceMinor >= 0
        && typeof line.currency === 'string' && line.currency.length > 0);
  }
}
