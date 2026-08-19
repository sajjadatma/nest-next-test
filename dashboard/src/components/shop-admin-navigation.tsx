import Link from "next/link";
import { ReactNode } from "react";
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

function ShopNavigationMark({ section }: { section: ShopSection }) {
  const paths: Record<ShopSection, ReactNode> = {
    overview: <path d="M4 12 12 5l8 7v7H4zM9 19v-4h6v4" />,
    products: <path d="M5 5h14v14H5zM8 9h8M8 13h5" />,
    inventory: <path d="M5 7h14v12H5zM8 7V5h8v2M8 12h8M8 15h5" />,
    categories: <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />,
    orders: <path d="M5 6h14v13H5zM8 6V4h8v2M8 11h8M8 15h5" />,
    shipping: <path d="M4 7h10v10H4zM14 10h3l3 3v4h-6zM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
    promotions: <path d="m13.5 4 6.5 6.5-9.5 9.5H4.5V14zM14 7l3 3M7 16h.01" />,
    moderation: <path d="M5 5h14v14H5zM8 9h8M8 13h5M8 16h3" />,
    reports: <path d="M5 19V5h14v14zM8 16v-4M12 16V8M16 16v-6" />,
    audit: <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />,
  };

  return (
    <svg
      aria-hidden="true"
      className="shop-admin-nav-icon"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[section]}
    </svg>
  );
}

export function ShopAdminNavigation({ active, permissions }: { active: ShopSection; permissions: string[] }) {
  const canAccess = (section: ShopSection) =>
    permissions.includes("shop:manage") ||
    (section === "orders" && permissions.includes("shop:orders:fulfill")) ||
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
          <ShopNavigationMark section={link.id} />
          <span className="shop-admin-nav-copy">
            <strong>{link.label}</strong>
            <span>{link.description}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
