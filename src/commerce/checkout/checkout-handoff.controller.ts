import { BadRequestException, Controller, Get, Headers, NotFoundException, Param, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Request } from 'express';
import { AuditService } from '../../audit/audit.service';
import { CartService } from '../cart/cart.service';
import { CheckoutLinkError, CheckoutLinkService, type CheckoutTokenPayload } from './checkout-link.service';

type HandoffReason = 'OUT_OF_STOCK' | 'PRICE_CHANGED' | 'EXPIRED' | 'INVALID' | 'EMPTY';

@Controller('checkout/handoff')
export class CheckoutHandoffController {
  constructor(
    private readonly checkoutLinks: CheckoutLinkService,
    private readonly carts: CartService,
    private readonly audit: AuditService,
  ) {}

  @Get(':token')
  async open(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Param('token') token: string,
    @Req() request: Request & { id?: string; user?: { id: string } },
  ) {
    const merchantId = this.requiredHeader(merchantHeader, 'x-merchant-id');
    if (!this.isWellFormedToken(token)) throw new BadRequestException('checkout token is malformed');
    const correlationId = request.headers['x-request-id']?.toString() ?? request.id ?? randomUUID();

    let payload: CheckoutTokenPayload;
    try {
      payload = await this.checkoutLinks.verifyCheckoutLink(token);
    } catch (error) {
      const reason: HandoffReason = error instanceof CheckoutLinkError && error.code === 'CHECKOUT_LINK_EXPIRED' ? 'EXPIRED' : 'INVALID';
      return this.failure(reason, correlationId, request.user?.id);
    }

    if (payload.merchantId !== merchantId) throw new NotFoundException('Checkout handoff was not found.');
    const cart = await this.carts.getCart(merchantId, payload.cartId);
    if (!cart) throw new NotFoundException('Checkout handoff was not found.');

    const reason = this.revalidationReason(payload, cart.items);
    const response = {
      cartId: cart.id,
      status: cart.status,
      items: cart.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPriceMinor: item.variant.priceMinor,
        currency: item.variant.currency,
        availability: item.quantity <= item.variant.stockQty ? 'IN_STOCK' : 'OUT_OF_STOCK',
        variant: { id: item.variant.id, sku: item.variant.sku, productId: item.variant.product.id, productName: item.variant.product.name },
      })),
      expiresAt: payload.expiresAt,
      canCheckout: reason === undefined,
      ...(reason ? { reason } : {}),
    };
    await this.audit.record('commerce.checkout_handoff_opened', 'cart', cart.id, request.user?.id, { merchantId, correlationId, canCheckout: response.canCheckout, reason });
    return response;
  }

  private async failure(reason: Extract<HandoffReason, 'EXPIRED' | 'INVALID'>, correlationId: string, actorId?: string) {
    await this.audit.record('commerce.checkout_handoff_opened', 'checkout_handoff', undefined, actorId, { correlationId, canCheckout: false, reason });
    return { cartId: null, status: null, items: [], expiresAt: null, canCheckout: false, reason };
  }

  private revalidationReason(payload: CheckoutTokenPayload, items: Array<{ variantId: string; quantity: number; variant: { priceMinor: number; currency: string; stockQty: number } }>): Exclude<HandoffReason, 'EXPIRED' | 'INVALID' | 'EMPTY'> | 'EMPTY' | undefined {
    if (items.length === 0) return 'EMPTY';
    const payloadLines = new Map(payload.lines.map((line) => [line.variantId, line]));
    if (payloadLines.size !== items.length || items.some((item) => !payloadLines.has(item.variantId) || payloadLines.get(item.variantId)?.quantity !== item.quantity)) return 'PRICE_CHANGED';
    if (items.some((item) => item.quantity > item.variant.stockQty)) return 'OUT_OF_STOCK';
    if (items.some((item) => {
      const snapshot = payloadLines.get(item.variantId)!;
      return snapshot.unitPriceMinor !== item.variant.priceMinor || snapshot.currency !== item.variant.currency;
    })) return 'PRICE_CHANGED';
    return undefined;
  }

  private requiredHeader(value: string | string[] | undefined, name: string): string {
    const header = typeof value === 'string' && value.trim() ? value.trim() : undefined;
    if (!header) throw new BadRequestException(`${name} is required`);
    return header;
  }

  private isWellFormedToken(token: string): boolean {
    return typeof token === 'string' && token.split('.').length === 2 && token.split('.').every(Boolean);
  }
}
