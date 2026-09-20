import type { PropsWithChildren } from "react";
import { CartProvider } from "@/components/cart-provider";
import { CartNotice, ShopFooter, ShopHeader } from "@/components/shop-chrome";

export default function ShopLayout({ children }: PropsWithChildren) {
  return <CartProvider><a className="skip-link" href="#main-content">Skip to main content</a><div className="shop-shell"><ShopHeader />{children}<ShopFooter /><CartNotice /></div></CartProvider>;
}
