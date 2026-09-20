import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SystemLogInput = {
  severity: 'info' | 'warning' | 'error';
  category: 'security' | 'access' | 'api' | 'health' | 'runtime';
  message: string;
  requestId?: string;
  path?: string;
  statusCode?: number;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

const sensitive = /password|token|secret|authorization|cookie|database_url/i;

@Injectable()
export class SystemLogService {
  private readonly logger = new Logger(SystemLogService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(input: SystemLogInput): Promise<void> {
    try {
      await this.prisma.systemLog.create({ data: { ...input, metadata: this.sanitize(input.metadata) as Prisma.InputJsonValue | undefined } });
    } catch (error) {
      this.logger.error('Unable to persist system log', error instanceof Error ? error.stack : undefined);
    }
  }

  list(filters: { category?: string; severity?: string; search?: string; limit?: number }) {
    const where: Prisma.SystemLogWhereInput = {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.search ? { OR: [{ message: { contains: filters.search, mode: 'insensitive' } }, { path: { contains: filters.search, mode: 'insensitive' } }, { requestId: { contains: filters.search, mode: 'insensitive' } }] } : {}),
    };
    return this.prisma.systemLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(filters.limit ?? 100, 200), select: { id: true, severity: true, category: true, message: true, requestId: true, path: true, statusCode: true, metadata: true, createdAt: true, actor: { select: { id: true, email: true, name: true } } } });
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => sensitive.test(key) ? [] : [[key, this.sanitize(item)]]));
    return typeof value === 'string' ? value.slice(0, 1_000) : value;
  }
}
