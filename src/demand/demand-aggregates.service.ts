import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_DEMAND_AGGREGATION_THRESHOLD } from './demand.constants';

export const demandSummaryOutcomes = ['matched', 'unmet', 'out-of-stock', 'price-too-high'] as const;
export type DemandSummaryOutcome = (typeof demandSummaryOutcomes)[number];

export type DemandSummaryInput = {
  merchantId: string;
  from: Date;
  to: Date;
  outcome?: DemandSummaryOutcome;
  actorId?: string;
};

type CountRow = { count: bigint };
type CategoryRow = CountRow & { category: string | null };
type AttributeRow = CountRow & { attribute: string; value: string };
type ValueRow = CountRow & { value: string };
type TotalsRow = { matched: bigint; unmet: bigint; outOfStock: bigint; priceTooHigh: bigint; volume: bigint };
type TrendRow = { firstHalf: bigint; secondHalf: bigint; total: bigint };

const matchedOutcomes = ['MATCHED', 'MATCHED_NOT_PURCHASED', 'PURCHASED', 'ABANDONED'] as const;
const unmetOutcomes = ['NO_MATCH', 'OUT_OF_STOCK', 'PRICE_TOO_HIGH', 'VARIANT_UNAVAILABLE'] as const;
const outOfStockOutcomes = ['OUT_OF_STOCK', 'VARIANT_UNAVAILABLE'] as const;
const priceTooHighOutcomes = ['PRICE_TOO_HIGH'] as const;

@Injectable()
export class DemandAggregatesService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(input: DemandSummaryInput) {
    if (input.actorId && (await this.prisma.merchantMembership.count({ where: { merchantId: input.merchantId, userId: input.actorId } })) === 0) {
      throw new NotFoundException('merchant was not found for this user');
    }
    const where = this.where(input);
    const trendWhere = this.where(input, 'd');
    const midpoint = new Date(input.from.valueOf() + (input.to.valueOf() - input.from.valueOf()) / 2);
    const [categories, totals, attributes, sizes, colors, trendRows] = await Promise.all([
      this.prisma.$queryRaw<CategoryRow[]>(Prisma.sql`SELECT d."category", COUNT(*) AS "count" FROM "DemandEvent" d WHERE ${where} GROUP BY d."category" ORDER BY "count" DESC, d."category" ASC NULLS LAST`),
      this.prisma.$queryRaw<TotalsRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE d."outcome" IN (${this.outcomeSql(matchedOutcomes)})) AS "matched",
          COUNT(*) FILTER (WHERE d."outcome" IN (${this.outcomeSql(unmetOutcomes)})) AS "unmet",
          COUNT(*) FILTER (WHERE d."outcome" IN (${this.outcomeSql(outOfStockOutcomes)})) AS "outOfStock",
          COUNT(*) FILTER (WHERE d."outcome" IN (${this.outcomeSql(priceTooHighOutcomes)})) AS "priceTooHigh",
          COUNT(*) AS "volume"
        FROM "DemandEvent" d WHERE ${where}`),
      this.prisma.$queryRaw<AttributeRow[]>(Prisma.sql`
        SELECT a.key AS "attribute", a.value AS "value", COUNT(*) AS "count"
        FROM "DemandEvent" d CROSS JOIN LATERAL jsonb_each_text(d."canonicalAttributes") a
        WHERE ${where}
        GROUP BY a.key, a.value
        HAVING COUNT(*) >= ${DEFAULT_DEMAND_AGGREGATION_THRESHOLD}
        ORDER BY "count" DESC, "attribute" ASC, "value" ASC`),
      this.prisma.$queryRaw<ValueRow[]>(Prisma.sql`
        SELECT d."size" AS "value", COUNT(*) AS "count" FROM "DemandEvent" d
        WHERE ${where} AND d."size" IS NOT NULL
        GROUP BY d."size"
        HAVING COUNT(*) >= ${DEFAULT_DEMAND_AGGREGATION_THRESHOLD}
        ORDER BY "count" DESC, "value" ASC`),
      this.prisma.$queryRaw<ValueRow[]>(Prisma.sql`
        SELECT d."canonicalAttributes"->>'color' AS "value", COUNT(*) AS "count" FROM "DemandEvent" d
        WHERE ${where} AND d."canonicalAttributes" ? 'color' AND d."canonicalAttributes"->>'color' IS NOT NULL
        GROUP BY d."canonicalAttributes"->>'color'
        HAVING COUNT(*) >= ${DEFAULT_DEMAND_AGGREGATION_THRESHOLD}
        ORDER BY "count" DESC, "value" ASC`),
      this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE d."occurredAt" < ${midpoint}) AS "firstHalf",
          COUNT(*) FILTER (WHERE d."occurredAt" >= ${midpoint}) AS "secondHalf",
          COUNT(*) AS "total"
        FROM "DemandEvent" d WHERE ${trendWhere}`),
    ]);
    const totalsRow = totals[0] ?? { matched: BigInt(0), unmet: BigInt(0), outOfStock: BigInt(0), priceTooHigh: BigInt(0), volume: BigInt(0) };
    const trend = trendRows[0] ?? { firstHalf: BigInt(0), secondHalf: BigInt(0), total: BigInt(0) };

    return {
      range: { from: input.from.toISOString(), to: input.to.toISOString() },
      volumeByCategory: categories.map(({ category, count }) => ({ category, count: Number(count) })),
      matched: Number(totalsRow.matched),
      unmet: Number(totalsRow.unmet),
      volume: Number(totalsRow.volume),
      outOfStock: Number(totalsRow.outOfStock),
      priceTooHigh: Number(totalsRow.priceTooHigh),
      topAttributes: attributes.map(({ attribute, value, count }) => ({ attribute, value, count: Number(count) })),
      topSizes: sizes.map(({ value, count }) => ({ value, count: Number(count) })),
      topColors: colors.map(({ value, count }) => ({ value, count: Number(count) })),
      trend: this.trendDirection(trend),
    };
  }

  private where(input: DemandSummaryInput, alias = 'd'): Prisma.Sql {
    const filters = [
      Prisma.sql`${Prisma.raw(alias)}."merchantId" = ${input.merchantId}`,
      Prisma.sql`${Prisma.raw(alias)}."occurredAt" >= ${input.from}`,
      Prisma.sql`${Prisma.raw(alias)}."occurredAt" <= ${input.to}`,
    ];
    const outcome = input.outcome ? this.outcomesFor(input.outcome) : undefined;
    if (outcome) filters.push(Prisma.sql`${Prisma.raw(alias)}."outcome" IN (${this.outcomeSql(outcome)})`);
    return Prisma.sql`${Prisma.join(filters, ' AND ')}`;
  }

  private outcomeSql(outcomes: readonly string[]) {
    return Prisma.join(outcomes.map((outcome) => Prisma.sql`${outcome}::"DemandOutcome"`));
  }

  private outcomesFor(outcome: DemandSummaryOutcome): readonly string[] {
    switch (outcome) {
      case 'matched': return matchedOutcomes;
      case 'unmet': return unmetOutcomes;
      case 'out-of-stock': return outOfStockOutcomes;
      case 'price-too-high': return priceTooHighOutcomes;
    }
  }

  private trendDirection({ firstHalf, secondHalf, total }: TrendRow): 'up' | 'down' | 'flat' | null {
    if (total < BigInt(DEFAULT_DEMAND_AGGREGATION_THRESHOLD)) return null;
    if (secondHalf > firstHalf) return 'up';
    if (secondHalf < firstHalf) return 'down';
    return 'flat';
  }
}
