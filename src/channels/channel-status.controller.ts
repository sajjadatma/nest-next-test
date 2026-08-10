import { BadRequestException, Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { ChannelRegistryService } from './channel-registry.service';
import { type ChannelAdapter } from './channel.types';

type ChannelStatus = {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  lastEventAt: null;
  error?: string;
};

@ApiTags('Channels')
@Controller('channels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChannelStatusController {
  constructor(
    private readonly registry: ChannelRegistryService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @RequirePermissions(PermissionKey.ChannelsRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read merchant-scoped channel configuration and health status' })
  @ApiOkResponse()
  status(@Headers('x-merchant-id') merchantHeader: string | string[] | undefined): ChannelStatus[] {
    this.requiredHeader(merchantHeader, 'x-merchant-id');
    return this.registry.list().map((adapter) => this.statusFor(adapter));
  }

  private statusFor(adapter: ChannelAdapter): ChannelStatus {
    const configured = this.isConfigured(adapter);
    return {
      id: adapter.channel,
      label: adapter.channel === 'telegram' ? 'Telegram' : adapter.channel,
      configured,
      healthy: false,
      lastEventAt: null,
      error: configured ? 'Channel health has not been verified' : 'Channel is not configured',
    };
  }

  private isConfigured(adapter: ChannelAdapter): boolean {
    switch (adapter.channel) {
      case 'telegram':
        return !!this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
      default:
        return false;
    }
  }

  private requiredHeader(value: string | string[] | undefined, name: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${name} is required`);
    return value.trim();
  }
}
