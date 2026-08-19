import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogService } from '../system-logs/system-log.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly systemLogs: SystemLogService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() { return { status: 'ok', service: 'api' }; }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including database connectivity' })
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      await this.systemLogs.record({ severity: 'error', category: 'health', message: 'Database readiness check failed' });
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
  }
}
