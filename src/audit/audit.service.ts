import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(action: string, targetType: string, targetId?: string, actorId?: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { action, targetType, targetId, actorId, metadata: metadata as Prisma.InputJsonValue | undefined } });
  }
}
