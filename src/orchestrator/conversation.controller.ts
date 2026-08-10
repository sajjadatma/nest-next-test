import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { type Request, type Response } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HandoffService } from '../conversations/handoff.service';
import { PermissionKey } from '../rbac/rbac.constants';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { OrchestratorService } from './orchestrator.service';

type WebMessageBody = {
  text?: unknown;
  externalMessageId?: unknown;
  externalUserId?: unknown;
};

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(OptionalJwtAuthGuard)
export class ConversationController {
  constructor(private readonly orchestrator: OrchestratorService, private readonly handoffs: HandoffService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a normalized web conversation message' })
  @ApiCreatedResponse()
  @ApiOkResponse({ description: 'Idempotent replay of an existing message' })
  async message(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Headers('x-web-user-id') webUserHeader: string | string[] | undefined,
    @Body() body: WebMessageBody,
    @Req() request: Request & { id?: string; user?: { id: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateBody(body);
    const correlationId = request.headers['x-request-id']?.toString() ?? request.id ?? randomUUID();
    response.setHeader('x-request-id', correlationId);
    const externalUserId = this.stringValue(body.externalUserId) ?? this.headerValue(webUserHeader) ?? request.user?.id;
    if (!externalUserId) throw new BadRequestException('externalUserId is required');
    const result = await this.orchestrator.handleWebMessage({
      merchantId: this.requiredHeader(merchantHeader, 'x-merchant-id'),
      text: body.text as string,
      externalMessageId: this.stringValue(body.externalMessageId),
      externalUserId,
      correlationId,
      actorId: request.user?.id,
    });
    response.status(result.created ? 201 : 200);
    return { conversationId: result.conversationId, messageId: result.messageId, reply: result.reply };
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'Read merchant-scoped normalized conversation history' })
  @ApiOkResponse()
  history(@Headers('x-merchant-id') merchantHeader: string | string[] | undefined, @Param('conversationId') conversationId: string) {
    return this.orchestrator.history(this.requiredHeader(merchantHeader, 'x-merchant-id'), conversationId);
  }

  @Post(':conversationId/handoff')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.ConversationsTakeover)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request merchant operator handoff for a conversation' })
  @ApiCreatedResponse()
  requestHandoff(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.handoffs.requestHandoff({ merchantId: this.requiredHeader(merchantHeader, 'x-merchant-id'), conversationId, reasonCode: 'HANDOFF_REQUIRED', actorId: user.id });
  }

  @Post(':conversationId/handoff/accept')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.ConversationsTakeover)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a requested merchant conversation handoff' })
  @ApiCreatedResponse()
  acceptHandoff(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.handoffs.acceptHandoff({ merchantId: this.requiredHeader(merchantHeader, 'x-merchant-id'), conversationId, actorId: user.id });
  }

  @Post(':conversationId/handoff/release')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.ConversationsTakeover)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release a human-handled conversation back to AI' })
  @ApiCreatedResponse()
  releaseHandoff(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.handoffs.releaseToAi({ merchantId: this.requiredHeader(merchantHeader, 'x-merchant-id'), conversationId, actorId: user.id });
  }

  @Get('handoffs')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.ConversationsRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List merchant-scoped conversation handoffs' })
  @ApiOkResponse()
  handoffList(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @CurrentUser() user: { id: string },
  ) {
    return this.handoffs.handoffsForMerchant(this.requiredHeader(merchantHeader, 'x-merchant-id'), user.id);
  }

  private validateBody(body: WebMessageBody): void {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).every((key) => ['text', 'externalMessageId', 'externalUserId'].includes(key))) {
      throw new BadRequestException('message body is invalid');
    }
    if (!this.stringValue(body.text)) throw new BadRequestException('text is required');
    if (body.externalMessageId !== undefined && !this.stringValue(body.externalMessageId)) throw new BadRequestException('externalMessageId is invalid');
    if (body.externalUserId !== undefined && !this.stringValue(body.externalUserId)) throw new BadRequestException('externalUserId is invalid');
  }

  private requiredHeader(value: string | string[] | undefined, name: string): string {
    const header = this.headerValue(value);
    if (!header) throw new BadRequestException(`${name} is required`);
    return header;
  }

  private headerValue(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
