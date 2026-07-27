import Link from "next/link";
import { ShopSection } from "@/components/shop-admin-types";

const links: { id: ShopSection; href: string; label: string; description: string }[] = [
  { id: "overview", href: "/dashboard/shop", label: "Overview", description: "Store health" },
  { id: "products", href: "/dashboard/shop/products", label: "Products", description: "Catalogue & stock" },
  { id: "categories", href: "/dashboard/shop/categories", label: "Categories", description: "Collections" },
  { id: "orders", href: "/dashboard/shop/orders", label: "Orders", description: "Fulfilment" },
];

export function ShopAdminNavigation({ active }: { active: ShopSection }) {
  return (
    <nav className="shop-admin-nav" aria-label="Shop management">
      {links.map((link) => (
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
