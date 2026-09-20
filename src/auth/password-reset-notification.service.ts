import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class PasswordResetNotificationService {
  private readonly logger = new Logger(PasswordResetNotificationService.name);

  async sendPasswordReset(email: string, token: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_EMAIL_FROM;
    if (!apiKey || !from) {
      this.logger.warn('Password reset email was not sent because RESEND_API_KEY or ORDER_EMAIL_FROM is not configured');
      return { status: 'SKIPPED' as const };
    }

    const resetUrl = new URL('/password-reset', process.env.SHOP_PUBLIC_URL ?? 'http://127.0.0.1:3000');
    resetUrl.searchParams.set('token', token);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `password-reset-${createHash('sha256').update(token).digest('hex')}`,
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Reset your NEST password',
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>Reset your password</h1><p>Use the link below to choose a new password. It expires in one hour and can only be used once.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p></div>`,
        }),
      });
      if (!response.ok) {
        this.logger.warn('Password reset email provider rejected a delivery request');
        return { status: 'FAILED' as const };
      }
      return { status: 'SENT' as const };
    } catch {
      this.logger.warn('Password reset email provider could not be reached');
      return { status: 'FAILED' as const };
    }
  }

}
