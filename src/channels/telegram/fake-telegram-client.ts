import { type TelegramClient, type TelegramDeliveryRequest } from './telegram-client.port';

export class FakeTelegramClient implements TelegramClient {
  readonly deliveries: TelegramDeliveryRequest[] = [];
  attempts = 0;
  failuresRemaining = 0;

  async sendMessage(request: TelegramDeliveryRequest): Promise<void> {
    await this.record(request);
  }

  async sendButtons(request: TelegramDeliveryRequest): Promise<void> {
    await this.record(request);
  }

  private async record(request: TelegramDeliveryRequest): Promise<void> {
    this.attempts += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('Fake Telegram delivery failure');
    }
    if (!this.deliveries.some((delivery) => delivery.idempotencyKey === request.idempotencyKey)) {
      this.deliveries.push(request);
    }
  }
}
