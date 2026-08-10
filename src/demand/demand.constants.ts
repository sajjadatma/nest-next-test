export const demandOutcomes = [
  'UNKNOWN',
  'MATCHED',
  'NO_MATCH',
  'OUT_OF_STOCK',
  'PRICE_TOO_HIGH',
  'VARIANT_UNAVAILABLE',
  'HANDED_OFF',
  'MATCHED_NOT_PURCHASED',
  'PURCHASED',
  'ABANDONED',
] as const;

export type DemandOutcomeKind = (typeof demandOutcomes)[number];

export const DEMAND_PRIVACY_VERSION = 'v1';
export const DEFAULT_DEMAND_AGGREGATION_THRESHOLD = 5;
export const demandChannels = ['instagram', 'whatsapp', 'telegram', 'web'] as const;

export const demandOutcomeTransitions: Readonly<Record<DemandOutcomeKind, readonly DemandOutcomeKind[]>> = {
  UNKNOWN: ['MATCHED', 'NO_MATCH', 'OUT_OF_STOCK', 'PRICE_TOO_HIGH', 'VARIANT_UNAVAILABLE', 'HANDED_OFF'],
  MATCHED: ['MATCHED_NOT_PURCHASED', 'PURCHASED', 'ABANDONED', 'HANDED_OFF'],
  NO_MATCH: [],
  OUT_OF_STOCK: [],
  PRICE_TOO_HIGH: [],
  VARIANT_UNAVAILABLE: [],
  HANDED_OFF: [],
  MATCHED_NOT_PURCHASED: [],
  PURCHASED: [],
  ABANDONED: [],
};
