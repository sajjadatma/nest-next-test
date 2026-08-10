export const inboundChannels = ['instagram', 'whatsapp', 'telegram', 'web'] as const;
export const inboundMessageTypes = ['text', 'image', 'audio', 'file', 'button', 'postback'] as const;

export type InboundChannel = (typeof inboundChannels)[number];
export type InboundMessageType = (typeof inboundMessageTypes)[number];

export type NormalizedInboundMessage = {
  id: string;
  merchantId: string;
  channel: InboundChannel;
  externalMessageId: string;
  externalUserId: string;
  customerId?: string;
  conversationId?: string;
  type: InboundMessageType;
  text?: string;
  mediaUrl?: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
};
