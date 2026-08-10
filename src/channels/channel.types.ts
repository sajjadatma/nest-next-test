import { type CommerceResponse } from '../ai/agent.service';
import { type InboundChannel, type NormalizedInboundMessage } from '../conversations/conversation.types';

export type ChannelErrorCode =
  | 'CHANNEL_VERIFICATION_FAILED'
  | 'CHANNEL_PAYLOAD_INVALID'
  | 'CHANNEL_DELIVERY_FAILED'
  | 'CHANNEL_UNSUPPORTED';

export type ChannelVerificationResult =
  | { ok: true }
  | { ok: false; errorCode: Extract<ChannelErrorCode, 'CHANNEL_VERIFICATION_FAILED' | 'CHANNEL_PAYLOAD_INVALID'> };

export type ChannelDeliveryResult =
  | { ok: true; deliveredAt: string }
  | { ok: false; errorCode: 'CHANNEL_DELIVERY_FAILED'; retryable: true };

export type ChannelDeliveryTarget = {
  merchantId: string;
  externalUserId: string;
  externalMessageId: string;
  correlationId: string;
};

export interface ChannelAdapter<RawPayload = unknown, OutboundPrimitive = unknown> {
  readonly channel: InboundChannel;
  verify(raw: RawPayload, merchantId: string): Promise<ChannelVerificationResult>;
  normalize(raw: RawPayload, merchantId: string): Promise<NormalizedInboundMessage>;
  format(response: CommerceResponse): OutboundPrimitive;
  deliver(outbound: OutboundPrimitive, target: ChannelDeliveryTarget): Promise<ChannelDeliveryResult>;
}
