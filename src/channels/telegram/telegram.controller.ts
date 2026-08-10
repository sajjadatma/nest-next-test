import { BadGatewayException, BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { type Response } from 'express';
import { ChannelRegistryService } from '../channel-registry.service';
import { OrchestratorService } from '../../orchestrator/orchestrator.service';
import { TelegramAdapter, type TelegramWebhookPayload } from './telegram.adapter';

@ApiTags('Telegram')
@Controller('channels/telegram')
export class TelegramController {
  constructor(
    private readonly registry: ChannelRegistryService,
    private readonly orchestrator: OrchestratorService,
    private readonly telegram: TelegramAdapter,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Process a verified Telegram Bot webhook update' })
  async webhook(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | string[] | undefined,
    @Headers('x-request-id') requestId: string | string[] | undefined,
    @Body() update: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const merchantId = this.requiredHeader(merchantHeader, 'x-merchant-id');
    const adapter = this.registry.resolve('telegram');
    if (!adapter.ok) throw new BadGatewayException(adapter.errorCode);
    const raw: TelegramWebhookPayload = { update, secretToken: this.headerValue(secretHeader) };
    const verification = await adapter.adapter.verify(raw, merchantId);
    if (!verification.ok) {
      if (verification.errorCode === 'CHANNEL_VERIFICATION_FAILED') throw new UnauthorizedException(verification.errorCode);
      throw new BadRequestException(verification.errorCode);
    }
    let normalized;
    try {
      normalized = await adapter.adapter.normalize(raw, merchantId);
    } catch {
      throw new BadRequestException('CHANNEL_PAYLOAD_INVALID');
    }
    const correlationId = this.headerValue(requestId) ?? randomUUID();
    response.setHeader('x-request-id', correlationId);
    const result = await this.orchestrator.handleChannelMessage(normalized, correlationId);
    if (!result.created) return { duplicate: true, conversationId: result.conversationId, messageId: result.messageId };

    const delivery = await adapter.adapter.deliver(adapter.adapter.format(result.reply), {
      merchantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      correlationId,
    });
    if (!delivery.ok) {
      response.status(502);
      return { errorCode: delivery.errorCode, retryable: delivery.retryable };
    }
    return { delivered: true, conversationId: result.conversationId, messageId: result.messageId, delivery };
  }

  @Get('webhook')
  @ApiOperation({ summary: 'Read Telegram webhook setup status without exposing credentials' })
  @ApiOkResponse()
  setup() {
    return { channel: this.telegram.channel, configured: this.telegram.isConfigured() };
  }

  private requiredHeader(value: string | string[] | undefined, name: string): string {
    const header = this.headerValue(value);
    if (!header) throw new BadRequestException(`${name} is required`);
    return header;
  }

  private headerValue(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
