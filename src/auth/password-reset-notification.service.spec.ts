import { PasswordResetNotificationService } from './password-reset-notification.service';

describe('PasswordResetNotificationService', () => {
  const original = { apiKey: process.env.RESEND_API_KEY, from: process.env.ORDER_EMAIL_FROM, shopUrl: process.env.SHOP_PUBLIC_URL };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.RESEND_API_KEY = original.apiKey;
    process.env.ORDER_EMAIL_FROM = original.from;
    process.env.SHOP_PUBLIC_URL = original.shopUrl;
  });

  it('sends the reset link through the configured email provider', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.ORDER_EMAIL_FROM = 'NEST <security@example.com>';
    process.env.SHOP_PUBLIC_URL = 'https://shop.example.com';
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);

    await expect(new PasswordResetNotificationService().sendPasswordReset('jane@example.com', 'reset-token')).resolves.toEqual({ status: 'SENT' });

    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer re_test' }),
    }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      to: ['jane@example.com'],
      subject: 'Reset your NEST password',
      html: expect.stringContaining('https://shop.example.com/password-reset?token=reset-token'),
    });
  });

  it('reports a skipped delivery when email is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ORDER_EMAIL_FROM;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(new PasswordResetNotificationService().sendPasswordReset('jane@example.com', 'reset-token')).resolves.toEqual({ status: 'SKIPPED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
