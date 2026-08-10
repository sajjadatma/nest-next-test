import { FakeTelegramClient } from './fake-telegram-client';
import { TelegramAdapter } from './telegram.adapter';

describe('TelegramController boundary', () => {
  const merchantId = 'merchant-telegram';
  const secret = 'telegram-webhook-secret';

  function update(updateId = 1) {
    return {
      update_id: updateId,
      message: { message_id: 55, date: 1_723_000_000, from: { id: 42, username: 'telegram-user' }, text: 'white shoes' },
    };
  }

  it('verifies and normalizes text and callback updates using update_id as the provider idempotency key', async () => {
    const adapter = new TelegramAdapter(new FakeTelegramClient(), secret);
    await expect(adapter.verify({ update: update(), secretToken: secret }, merchantId)).resolves.toEqual({ ok: true });
    await expect(adapter.verify({ update: update(), secretToken: 'wrong' }, merchantId)).resolves.toEqual({ ok: false, errorCode: 'CHANNEL_VERIFICATION_FAILED' });

    await expect(adapter.normalize({ update: update(10), secretToken: secret }, merchantId)).resolves.toMatchObject({
      merchantId,
      channel: 'telegram',
      externalMessageId: 'update:10',
      externalUserId: '42',
      type: 'text',
      text: 'white shoes',
      payload: { updateId: 10, messageId: 55, username: 'telegram-user' },
    });
    await expect(adapter.normalize({
      update: { update_id: 11, callback_query: { id: 'callback-1', from: { id: 42 }, data: 'variant:blue', message: { message_id: 56, date: 1_723_000_001 } } },
      secretToken: secret,
    }, merchantId)).resolves.toMatchObject({ externalMessageId: 'update:11', type: 'postback', text: 'variant:blue' });
  });

  it('rejects malformed updates before normalization', async () => {
    const adapter = new TelegramAdapter(new FakeTelegramClient(), secret);
    await expect(adapter.verify({ update: { update_id: 'bad' }, secretToken: secret }, merchantId)).resolves.toEqual({ ok: false, errorCode: 'CHANNEL_PAYLOAD_INVALID' });
    await expect(adapter.normalize({ update: { update_id: 2, message: { message_id: 1 } }, secretToken: secret }, merchantId)).rejects.toThrow('CHANNEL_PAYLOAD_INVALID');
  });

  it('formats text, buttons, and product links using only Telegram primitives', () => {
    const adapter = new TelegramAdapter(new FakeTelegramClient(), secret);
    expect(adapter.format({ kind: 'quick_replies', text: 'Choose a size', options: [{ id: 'size:42', label: '42' }] })).toEqual({
      text: 'Choose a size', inlineKeyboard: [{ text: '42', callbackData: 'size:42' }],
    });
    expect(adapter.format({ kind: 'product_carousel', intro: 'Available products', items: [{ title: 'Runner', priceMinor: 1200, currency: 'USD', productUrl: 'https://shop.example.test/products/runner' }] })).toEqual({
      text: 'Available products\nRunner — 1200 USD', inlineKeyboard: [{ text: 'View Runner', url: 'https://shop.example.test/products/runner' }],
    });
  });

  it('retries one failed delivery and records a single delivered side effect', async () => {
    const client = new FakeTelegramClient();
    client.failuresRemaining = 1;
    const adapter = new TelegramAdapter(client, secret);
    await expect(adapter.deliver({ text: 'Hello' }, {
      merchantId,
      externalUserId: '42',
      externalMessageId: 'update:12',
      correlationId: 'correlation-12',
    })).resolves.toMatchObject({ ok: true });
    expect(client.attempts).toBe(2);
    expect(client.deliveries).toHaveLength(1);

    client.failuresRemaining = 2;
    await expect(adapter.deliver({ text: 'Failure' }, {
      merchantId,
      externalUserId: '42',
      externalMessageId: 'update:13',
      correlationId: 'correlation-13',
    })).resolves.toEqual({ ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true });
    expect(client.attempts).toBe(4);
    expect(client.deliveries).toHaveLength(1);
  });
});
