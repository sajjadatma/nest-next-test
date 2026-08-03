import Link from "next/link";
import { ShopSection } from "@/components/shop-admin-types";

const links: { id: ShopSection; href: string; label: string; description: string }[] = [
  { id: "overview", href: "/dashboard/shop", label: "Overview", description: "Store health" },
  { id: "products", href: "/dashboard/shop/products", label: "Products", description: "Catalogue & stock" },
  { id: "inventory", href: "/dashboard/shop/inventory", label: "Inventory", description: "Stock control" },
  { id: "categories", href: "/dashboard/shop/categories", label: "Categories", description: "Collections" },
  { id: "orders", href: "/dashboard/shop/orders", label: "Orders", description: "Fulfilment" },
  { id: "shipping", href: "/dashboard/shop/shipping", label: "Shipping", description: "Delivery rules" },
  { id: "promotions", href: "/dashboard/shop/promotions", label: "Promotions", description: "Discount codes" },
  { id: "moderation", href: "/dashboard/shop/moderation", label: "Moderation", description: "Customer feedback" },
  { id: "reports", href: "/dashboard/shop/reports", label: "Reports", description: "Performance" },
  { id: "audit", href: "/dashboard/shop/audit", label: "Audit", description: "Change history" },
];

const sectionPermissions: Partial<Record<ShopSection, string>> = {
  products: "shop:catalog:manage",
  categories: "shop:catalog:manage",
  inventory: "shop:inventory:manage",
  orders: "shop:orders:read",
  shipping: "shop:shipping:manage",
  promotions: "shop:promotions:manage",
  moderation: "shop:comments:moderate",
  reports: "shop:analytics:read",
  audit: "shop:audit:read",
};

export function ShopAdminNavigation({ active, permissions }: { active: ShopSection; permissions: string[] }) {
  const canAccess = (section: ShopSection) =>
    permissions.includes("shop:manage") ||
    (sectionPermissions[section] ? permissions.includes(sectionPermissions[section]) : false);
  return (
    <nav className="shop-admin-nav" aria-label="Shop management">
      {links.filter((link) => canAccess(link.id)).map((link) => (
        <Link
          key={link.id}
          href={link.href}
          className={active === link.id ? "active" : undefined}
          aria-current={active === link.id ? "page" : undefined}
        >
          <strong>{link.label}</strong>
          <span>{link.description}</span>
        </Link>
      ))}
    </nav>
  );
}
