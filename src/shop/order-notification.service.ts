import { Injectable, Logger } from '@nestjs/common';

type ConfirmableOrder = { id: string; number: string; email: string; totalMinor: number; shippingAddress: unknown };

@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  async sendConfirmation(order: ConfirmableOrder, confirmationToken: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_EMAIL_FROM;
    const shopUrl = process.env.SHOP_PUBLIC_URL ?? 'http://127.0.0.1:3000';
    if (!apiKey || !from) return { status: 'SKIPPED' as const };
    const confirmationUrl = `${shopUrl.replace(/\/$/, '')}/shop/order/${confirmationToken}`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `order-confirmation-${order.id}` },
      body: JSON.stringify({ from, to: [order.email], subject: `Order ${order.number} received`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>Thanks for your order.</h1><p>We received order <strong>${order.number}</strong> for <strong>$${(order.totalMinor / 100).toFixed(2)}</strong>.</p><p>Payment will be collected on delivery.</p><p><a href="${confirmationUrl}">View your order confirmation</a></p></div>` }),
    });
    if (!response.ok) { this.logger.warn(`Order confirmation email failed for ${order.number}`); return { status: 'FAILED' as const }; }
    const body = await response.json() as { id?: string };
    return { status: 'SENT' as const, id: body.id };
  }
}
