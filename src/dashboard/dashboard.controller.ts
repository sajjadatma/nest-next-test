import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PermissionKey } from '../rbac/rbac.constants';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionKey.DashboardRead)
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'Get dashboard metrics and recent users' })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async overview() {
    const [users, recentUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true, roles: { select: { role: { select: { key: true } } } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
    return { metrics: [{ label: 'Registered users', value: users }, { label: 'API status', value: 'Healthy' }, { label: 'Authentication', value: 'JWT active' }], recentUsers };
  }
}
