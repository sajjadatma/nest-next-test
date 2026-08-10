import { Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { type CommerceResponse } from '../../ai/agent.service';
import { type ChannelAdapter, type ChannelDeliveryResult, type ChannelDeliveryTarget, type ChannelVerificationResult } from '../channel.types';
import { type NormalizedInboundMessage } from '../../conversations/conversation.types';
import { type TelegramClient, type TelegramOutboundMessage } from './telegram-client.port';

export type TelegramWebhookPayload = {
  update: unknown;
  secretToken?: string;
};

type TelegramMessage = {
  message_id: number;
  date?: number;
  from: { id: number | string; username?: string };
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: { id: number | string; username?: string };
  data?: string;
  message?: { message_id: number; date?: number };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

@Injectable()
export class TelegramAdapter implements ChannelAdapter<TelegramWebhookPayload, TelegramOutboundMessage> {
  readonly channel = 'telegram' as const;

  constructor(
    private readonly client: TelegramClient,
    private readonly webhookSecret?: string,
    private readonly shopPublicUrl?: string,
  ) {}

  async verify(raw: TelegramWebhookPayload): Promise<ChannelVerificationResult> {
    if (!this.matchesSecret(raw?.secretToken)) return { ok: false, errorCode: 'CHANNEL_VERIFICATION_FAILED' };
    return this.isUpdate(raw?.update)
      ? { ok: true }
      : { ok: false, errorCode: 'CHANNEL_PAYLOAD_INVALID' };
  }

  async normalize(raw: TelegramWebhookPayload, merchantId: string): Promise<NormalizedInboundMessage> {
    if (!this.isUpdate(raw?.update)) throw new Error('CHANNEL_PAYLOAD_INVALID');
    const update = raw.update;
    if (update.message && this.isTextMessage(update.message)) {
      return {
        id: randomUUID(),
        merchantId,
        channel: 'telegram',
        externalMessageId: `update:${update.update_id}`,
        externalUserId: String(update.message.from.id),
        type: 'text',
        text: update.message.text.trim(),
        payload: this.payload(update.update_id, update.message.message_id, update.message.from.username),
        occurredAt: this.occurredAt(update.message.date),
      };
    }
    if (update.callback_query && this.isCallbackQuery(update.callback_query)) {
      return {
        id: randomUUID(),
        merchantId,
        channel: 'telegram',
        externalMessageId: `update:${update.update_id}`,
        externalUserId: String(update.callback_query.from.id),
        type: 'postback',
        text: update.callback_query.data.trim(),
        payload: this.payload(update.update_id, update.callback_query.message?.message_id, update.callback_query.from.username, update.callback_query.id),
        occurredAt: this.occurredAt(update.callback_query.message?.date),
      };
    }
    throw new Error('CHANNEL_PAYLOAD_INVALID');
  }

  isConfigured(): boolean {
    return !!this.webhookSecret;
  }

  format(response: CommerceResponse): TelegramOutboundMessage {
    switch (response.kind) {
      case 'quick_replies':
        return {
          text: response.text,
          inlineKeyboard: response.options.map((option) => ({ text: option.label, callbackData: option.id })),
        };
      case 'checkout_link':
        return { text: response.text, inlineKeyboard: [{ text: 'Open secure checkout', url: response.url }] };
      case 'product_carousel':
        return this.formatProducts(response);
      case 'human_handoff':
      case 'text':
        return { text: response.text };
    }
  }

  async deliver(outbound: TelegramOutboundMessage, target: ChannelDeliveryTarget): Promise<ChannelDeliveryResult> {
    const request = { chatId: target.externalUserId, message: outbound, idempotencyKey: `${target.merchantId}:${target.externalMessageId}` };
    try {
      await this.send(request);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
      try {
        await this.send(request);
      } catch {
        return { ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true };
      }
    }
    return { ok: true, deliveredAt: new Date().toISOString() };
  }

  private async send(request: { chatId: string; message: TelegramOutboundMessage; idempotencyKey: string }): Promise<void> {
    if (request.message.inlineKeyboard?.length) return this.client.sendButtons(request);
    return this.client.sendMessage(request);
  }

  private formatProducts(response: Extract<CommerceResponse, { kind: 'product_carousel' }>): TelegramOutboundMessage {
    const products = response.items.map((item) => this.product(item));
    return {
      text: [response.intro, ...products.map(({ title, priceMinor, currency }) => `${title} — ${priceMinor} ${currency}`)].filter(Boolean).join('\n'),
      inlineKeyboard: products.map(({ title, productUrl }) => ({ text: `View ${title}`, url: this.productLink(productUrl) })),
    };
  }

  private product(item: Record<string, unknown>): { title: string; priceMinor: number; currency: string; productUrl: string } {
    if (
      typeof item.title !== 'string' || !item.title.trim()
      || !Number.isSafeInteger(item.priceMinor) || typeof item.currency !== 'string' || !item.currency.trim()
      || typeof item.productUrl !== 'string' || !item.productUrl.trim()
    ) throw new Error('invalid product response');
    return {
      title: item.title as string,
      priceMinor: item.priceMinor as number,
      currency: item.currency as string,
      productUrl: item.productUrl as string,
    };
  }

  private matchesSecret(value: unknown): boolean {
    if (!this.webhookSecret || typeof value !== 'string') return false;
    const expected = Buffer.from(this.webhookSecret);
    const received = Buffer.from(value);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private isUpdate(value: unknown): value is TelegramUpdate {
    return !!value && typeof value === 'object' && !Array.isArray(value)
      && Number.isSafeInteger((value as { update_id?: unknown }).update_id)
      && (!!(value as TelegramUpdate).message || !!(value as TelegramUpdate).callback_query);
  }

  private isTextMessage(message: TelegramMessage): message is TelegramMessage & { text: string } {
    return Number.isSafeInteger(message.message_id)
      && !!message.from && (typeof message.from.id === 'number' || typeof message.from.id === 'string')
      && typeof message.text === 'string' && !!message.text.trim();
  }

  private isCallbackQuery(query: TelegramCallbackQuery): query is TelegramCallbackQuery & { data: string } {
    return typeof query.id === 'string' && !!query.id
      && !!query.from && (typeof query.from.id === 'number' || typeof query.from.id === 'string')
      && typeof query.data === 'string' && !!query.data.trim();
  }

  private occurredAt(unixSeconds: number | undefined): string {
    return typeof unixSeconds === 'number' && Number.isSafeInteger(unixSeconds)
      ? new Date(unixSeconds * 1000).toISOString()
      : new Date().toISOString();
  }

  private payload(updateId: number, messageId: number | undefined, username?: string, callbackQueryId?: string): Record<string, unknown> {
    return {
      updateId,
      ...(messageId !== undefined ? { messageId } : {}),
      ...(username ? { username } : {}),
      ...(callbackQueryId ? { callbackQueryId } : {}),
    };
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  private productLink(value: string): string {
    if (this.isHttpUrl(value)) return value;
    if (!value.startsWith('/') || !this.shopPublicUrl || !this.isHttpUrl(this.shopPublicUrl)) throw new Error('product link is unavailable');
    return new URL(value, this.shopPublicUrl).toString();
  }
}
