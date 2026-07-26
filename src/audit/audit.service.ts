import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SystemLogService } from '../system-logs/system-log.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService, private readonly systemLogs: SystemLogService) {}

  async record(action: string, targetType: string, targetId?: string, actorId?: string, metadata?: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { action, targetType, targetId, actorId, metadata: metadata as Prisma.InputJsonValue | undefined } });
    await this.systemLogs.record({ severity: 'info', category: 'security', message: action, actorId, metadata: { targetType, targetId, ...metadata } });
  }

  loginAndSignupHistory(userId: string) {
    return this.prisma.auditLog.findMany({
      where: { actorId: userId, action: { in: ['identity.registered', 'identity.logged_in'] } },
      select: { action: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
