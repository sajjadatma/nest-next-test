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
  isActive: boolean;
  _count?: { companies: number; priceLists: number };
};

export type Variant = {
  id: string;
  sku: string;
  name: string;
  options?: string | null;
  priceMinor?: number;
  basePriceMinor?: number;
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

export type PriceTier = { id: string; minQuantity: number; priceMinor: number };
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

