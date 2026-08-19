export type ShopSection =
  | "overview"
  | "products"
  | "inventory"
  | "categories"
  | "orders"
  | "shipping"
  | "promotions"
  | "moderation"
  | "reports"
  | "audit";

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  _count: { products: number; children: number };
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceMinor: number;
  stockQty: number;
  lowStockThreshold: number;
  isActive: boolean;
  imageUrl: string | null;
  material: string | null;
  dimensions: string | null;
  care: string | null;
  featuredRank: number | null;
  images: { id: string; url: string; alt: string; position: number }[];
  categoryId: string;
  category: Category;
};

export type OrderStatus = "PENDING" | "CONFIRMED" | "PACKING" | "SHIPPED" | "DELIVERED" | "FULFILLED" | "CANCELLED";

export type Order = {
  id: string;
  number: string;
  email: string;
  phone: string;
  status: OrderStatus;
  totalMinor: number;
  subtotalMinor: number;
  shippingMinor: number;
  shippingMethod: string;
  shippingLabel: string;
  shippingEta: string;
  createdAt: string;
  cancellationReason: string | null;
  shippingAddress: {
    fullName?: string;
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  items: { id: string; productName: string; quantity: number }[];
};

export type ShopData = {
  metrics: {
    products: number;
    orders: number;
    customers: number;
    revenueMinor: number;
  };
  products: Product[];
  categories: Category[];
};

export type OrderPage = {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type ProductDraft = {
  name: string;
  slug: string;
  description: string;
  priceMinor: string;
  stockQty: string;
  categoryId: string;
  imageUrl: string;
  material: string;
  dimensions: string;
  care: string;
  featuredRank: string;
  galleryUrls: string;
  isActive: boolean;
};

export const emptyProduct: ProductDraft = {
  name: "",
  slug: "",
  description: "",
  priceMinor: "",
  stockQty: "0",
  categoryId: "",
  imageUrl: "",
  material: "",
  dimensions: "",
  care: "",
  featuredRank: "",
  galleryUrls: "",
  isActive: true,
};

export const statuses: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKING",
  "SHIPPED",
  "DELIVERED",
  "FULFILLED",
  "CANCELLED",
];

export const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
