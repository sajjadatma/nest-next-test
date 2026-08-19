export type CompanyRole = "OWNER" | "ADMIN" | "BUYER" | "VIEWER";
export type CompanyStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";

export type Company = {
  id: string;
  name: string;
  slug: string;
  legalName?: string | null;
  taxRegistrationNumber?: string | null;
  status: CompanyStatus;
  customerGroupId?: string | null;
  customerGroup?: CustomerGroup | null;
  membership?: { id: string; role: CompanyRole; status: MembershipStatus };
  _count?: { memberships: number };
  memberships?: Membership[];
  createdAt?: string;
};

export type Membership = {
  id: string;
  role: CompanyRole;
  status: MembershipStatus;
  createdAt?: string;
  user: { id: string; email: string; name?: string | null };
};

export type CustomerGroup = {
  id: string;
  name: string;
  code: string;
  currency?: string;
  isActive: boolean;
  _count?: { companies: number; priceLists: number };
};

export type Variant = {
  id: string;
  sku: string;
  name: string;
  options?: string | null;
  basePriceMinor: number;
  /** Kept optional for backward-compatible responses from older deployments. */
  priceMinor?: number;
  currency: string;
  stockQty: number;
  lowStockThreshold: number;
  minimumOrderQty: number;
  packSize: number;
  quantityIncrement: number;
  isActive: boolean;
  position?: number;
  product?: { id: string; name: string; slug?: string; imageUrl?: string | null; categoryId?: string | null };
};

export type PriceTier = { id: string; minimumQuantity: number; unitPriceMinor: number };
export type PriceListItem = {
  id: string;
  priceMinor: number;
  variant: Variant;
  tiers: PriceTier[];
};
export type PriceList = {
  id: string;
  name: string;
  code: string;
  currency: string;
  priority: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  customerGroupId: string;
  customerGroup?: CustomerGroup;
  items?: PriceListItem[];
};

export type CatalogItem = {
  variantId: string;
  sku: string;
  name: string;
  product: { id: string; name: string; slug: string; description?: string | null; imageUrl?: string | null; category?: { name: string } | null };
  currency: string;
  unitPriceMinor: number;
  quantity: number;
  subtotalMinor: number;
  source: "variant" | "price_list" | "tier";
  minimumOrderQty: number;
  packSize: number;
  quantityIncrement: number;
  stockQty: number;
};

export type CatalogResponse = {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  companyId: string;
  customerGroupId: string | null;
};

export type B2bCartLine = {
  lineId: string;
  variantId: string;
  sku: string;
  name: string;
  currency: string;
  unitPriceMinor: number;
  quantity: number;
  subtotalMinor: number;
  source: "variant" | "price_list" | "tier";
  minimumOrderQty: number;
  packSize: number;
  quantityIncrement: number;
  stockQty: number;
  valid: boolean;
  validationError: string | null;
};

export type B2bCart = {
  id: string | null;
  companyId: string;
  currency: string;
  lines: B2bCartLine[];
  itemCount: number;
  subtotalMinor: number;
  hasInvalidLines: boolean;
  updatedAt: string | null;
};

export type CompanyAddress = {
  id: string;
  label?: string | null;
  recipientName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  countryCode: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
};

export type B2bPurchaseRequest = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  currency: string;
  subtotalMinor: number;
  notes?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  lines: Array<{ id: string; sku: string; productName: string; quantity: number; subtotalMinor: number }>;
};

export type B2bOrder = {
  id: string;
  number: string;
  status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  paymentStatus: "PENDING_MANUAL";
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  createdAt: string;
  lines: Array<{ id: string; sku: string; productName: string; quantity: number; subtotalMinor: number }>;
  company?: { id: string; name: string; slug: string };
  createdBy?: { id: string; name?: string | null; email: string };
};
