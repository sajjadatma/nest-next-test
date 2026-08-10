import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RetentionRequest = {
  cutoff: Date;
  merchantId?: string;
  dryRun: boolean;
};

export type RetentionResult = { count: number; deleted: number };

@Injectable()
export class DemandRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteDemandOlderThan({ cutoff, merchantId, dryRun }: RetentionRequest): Promise<RetentionResult> {
    const where = { occurredAt: { lt: cutoff }, ...(merchantId ? { merchantId } : {}) };
    const count = await this.prisma.demandEvent.count({ where });
    if (dryRun) return { count, deleted: 0 };
    const { count: deleted } = await this.prisma.demandEvent.deleteMany({ where });
    return { count, deleted };
  }

  // DemandEvent and Message deliberately have no raw provider-payload storage.
  async purgeUnlinkedRawData(): Promise<RetentionResult> {
    return { count: 0, deleted: 0 };
  }
}
