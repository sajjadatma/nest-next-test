export const structuredIntentKinds = [
  'product_search',
  'refine_search',
  'compare',
  'select_variant',
  'add_to_cart',
  'checkout',
  'handoff',
  'other',
] as const;

export type StructuredIntentKind = (typeof structuredIntentKinds)[number];

export type StructuredIntent = {
  intent: StructuredIntentKind;
  category?: string;
  attributes?: Record<string, string>;
  size?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  referenceProductIds?: string[];
  purchaseIntent?: 'low' | 'medium' | 'high' | 'unknown';
  confidence: number;
  missingInformation: string[];
};
