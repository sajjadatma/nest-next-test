import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type RetentionRequest, type RetentionResult } from '../demand/demand-retention.service';

@Injectable()
export class ConversationRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteConversationsOlderThan({ cutoff, merchantId, dryRun }: RetentionRequest): Promise<RetentionResult> {
    const where = { updatedAt: { lt: cutoff }, ...(merchantId ? { merchantId } : {}) };
    const count = await this.prisma.conversation.count({ where });
    if (dryRun) return { count, deleted: 0 };
    const { count: deleted } = await this.prisma.conversation.deleteMany({ where });
    return { count, deleted };
  }
}
