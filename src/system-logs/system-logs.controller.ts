import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { SystemLogService } from './system-log.service';

@ApiTags('System logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionKey.SystemLogsRead)
@Controller('admin/system-logs')
export class SystemLogsController {
  constructor(private readonly systemLogs: SystemLogService) {}

  @Get()
  @ApiOperation({ summary: 'List sanitized system, security, access, API, and health events' })
  list(@Query('category') category?: string, @Query('severity') severity?: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    return this.systemLogs.list({ category, severity, search, limit: limit ? Number(limit) : undefined });
  }
}
