"use client";

import { useEffect, type PropsWithChildren } from "react";
import { useCartStore } from "@/stores/cart-store";

export function CartProvider({ children }: PropsWithChildren) {
  const hydrate = useCartStore((state) => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  return children;
}

export function useCart() {
  const cart = useCartStore((state) => state.cart);
  const ready = useCartStore((state) => state.ready);
  const notice = useCartStore((state) => state.notice);
  const itemCount = cart.reduce((total, line) => total + line.quantity, 0);
  const subtotalMinor = cart.reduce((total, line) => total + line.priceMinor * line.quantity, 0);
  return {
    cart,
    ready,
    notice,
    itemCount,
    subtotalMinor,
    addProduct: useCartStore((state) => state.addProduct),
    updateQuantity: useCartStore((state) => state.updateQuantity),
    removeProduct: useCartStore((state) => state.removeProduct),
    clearCart: useCartStore((state) => state.clearCart),
    dismissNotice: useCartStore((state) => state.dismissNotice),
  };
}
