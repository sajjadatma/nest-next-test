import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { CartRepository, CartScope, CartView } from './cart.repository';

export class CartError extends Error {
  constructor(public readonly code: 'CART_NOT_FOUND' | 'VARIANT_NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'CART_EMPTY', message: string) {
    super(message);
  }
}

@Injectable()
export class CartService {
  constructor(private readonly carts: CartRepository, private readonly audit: AuditService) {}

  async createCart(scope: CartScope, actorId?: string) {
    const cart = await this.carts.create(scope);
    await this.audit.record('commerce.cart_created', 'cart', cart.id, actorId, { merchantId: scope.merchantId });
    return cart;
  }

  async addToCart(input: CartScope & { cartId: string; variantId: string; quantity: number }, actorId?: string): Promise<CartView> {
    const result = await this.carts.addVerifiedItem(input.merchantId, input.cartId, input.variantId, input.quantity);
    if (result.kind === 'cart_missing') throw new CartError('CART_NOT_FOUND', 'Cart was not found for this merchant.');
    if (result.kind === 'variant_missing') throw new CartError('VARIANT_NOT_FOUND', 'Variant was not found for this merchant.');
    if (result.kind === 'insufficient_stock') throw new CartError('INSUFFICIENT_STOCK', 'Requested quantity is unavailable.');
    await this.audit.record('commerce.cart_item_added', 'cart', input.cartId, actorId, { merchantId: input.merchantId, variantId: input.variantId, quantity: input.quantity });
    return result.cart;
  }

  getCart(merchantId: string, cartId: string) {
    return this.carts.findScoped(merchantId, cartId);
  }

  async prepareCheckout(merchantId: string, cartId: string): Promise<CartView> {
    const result = await this.carts.prepareCheckout(merchantId, cartId);
    if (result.kind === 'cart_missing') throw new CartError('CART_NOT_FOUND', 'Cart was not found for this merchant.');
    if (result.kind === 'cart_empty') throw new CartError('CART_EMPTY', 'Cart has no items.');
    if (result.kind === 'insufficient_stock') throw new CartError('INSUFFICIENT_STOCK', 'Cart inventory is no longer available.');
    return result.cart;
  }

  async markCheckoutLink(merchantId: string, cartId: string, tokenHash: string, expiresAt: Date, actorId?: string) {
    const result = await this.carts.markHandedOff(merchantId, cartId, tokenHash, expiresAt);
    if (result.count !== 1) throw new CartError('CART_NOT_FOUND', 'Cart was not found for this merchant.');
    await this.audit.record('commerce.checkout_link_created', 'cart', cartId, actorId, { merchantId, expiresAt: expiresAt.toISOString() });
  }

  expire(now = new Date()) {
    return this.carts.expire(now);
  }
}
