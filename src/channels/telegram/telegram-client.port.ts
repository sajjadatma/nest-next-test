export const TELEGRAM_CLIENT = Symbol('TELEGRAM_CLIENT');

export type TelegramInlineButton = {
  text: string;
  callbackData?: string;
  url?: string;
};

export type TelegramOutboundMessage = {
  text: string;
  inlineKeyboard?: TelegramInlineButton[];
};

export type TelegramDeliveryRequest = {
  chatId: string;
  message: TelegramOutboundMessage;
  idempotencyKey: string;
};

export interface TelegramClient {
  sendMessage(request: TelegramDeliveryRequest): Promise<void>;
  sendButtons(request: TelegramDeliveryRequest): Promise<void>;
}

export class HttpTelegramClient implements TelegramClient {
  constructor(private readonly token: string) {}

  async sendMessage(request: TelegramDeliveryRequest): Promise<void> {
    await this.send(request, undefined);
  }

  async sendButtons(request: TelegramDeliveryRequest): Promise<void> {
    await this.send(request, request.message.inlineKeyboard);
  }

  private async send(request: TelegramDeliveryRequest, buttons: TelegramInlineButton[] | undefined): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: request.chatId,
        text: request.message.text,
        ...(buttons?.length ? {
          reply_markup: {
            inline_keyboard: buttons.map((button) => [{ text: button.text, ...(button.url ? { url: button.url } : { callback_data: button.callbackData }) }]),
          },
        } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`);
  }
}
