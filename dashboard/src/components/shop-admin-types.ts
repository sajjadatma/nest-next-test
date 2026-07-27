export type ShopSection = "overview" | "products" | "categories" | "orders";

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
  isActive: boolean;
  imageUrl: string | null;
  categoryId: string;
  category: Category;
};

export type OrderStatus = "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED";

export type Order = {
  id: string;
  number: string;
  email: string;
  phone: string;
  status: OrderStatus;
  totalMinor: number;
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
  isActive: true,
};

export const statuses: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "FULFILLED",
  "CANCELLED",
];

export const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
