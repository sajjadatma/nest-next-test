export type DemandOutcomeFilter = "ALL" | "MATCHED" | "UNMATCHED" | "OUT_OF_STOCK" | "PRICE_TOO_HIGH";

export type DemandSummary = {
  range: { from: string; to: string };
  volume: number;
  volumeByCategory: Array<{ category: string | null; count: number }>;
  matched: number;
  unmet: number;
  outOfStock: number;
  priceTooHigh: number;
  topAttributes: Array<{ attribute: string; value: string; count: number }>;
  topSizes: Array<{ value: string; count: number }>;
  topColors: Array<{ value: string; count: number }>;
  trend: "up" | "down" | "flat" | null;
};

export const OUTCOME_FILTERS: Array<{ value: DemandOutcomeFilter; label: string; apiValue?: string }> = [
  { value: "ALL", label: "All demand" },
  { value: "MATCHED", label: "Matched", apiValue: "matched" },
  { value: "UNMATCHED", label: "Unmatched", apiValue: "unmet" },
  { value: "OUT_OF_STOCK", label: "Out of stock", apiValue: "out-of-stock" },
  { value: "PRICE_TOO_HIGH", label: "Price too high", apiValue: "price-too-high" },
];

export const TREND_LABELS: Record<Exclude<DemandSummary["trend"], null>, string> = {
  up: "Increasing",
  down: "Decreasing",
  flat: "Steady",
};
