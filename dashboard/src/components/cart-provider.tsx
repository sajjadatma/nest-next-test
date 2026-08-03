"use client";

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartLine, Product } from "@/components/shop-types";

type CartContextValue = {
  cart: CartLine[];
  ready: boolean;
  itemCount: number;
  subtotalMinor: number;
  notice: string;
  addProduct: (product: Product, quantity?: number) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeProduct: (id: string) => void;
  clearCart: () => void;
  dismissNotice: () => void;
};

const STORAGE_KEY = "nest-shop-cart-v2";
const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartLine[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as CartLine[];
    const legacy = localStorage.getItem("nest-shop-cart");
    return legacy ? (JSON.parse(legacy) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: PropsWithChildren) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setCart(loadCart());
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  const value = useMemo<CartContextValue>(() => {
    const updateQuantity = (id: string, quantity: number) => {
      setCart((current) =>
        current.flatMap((line) => {
          if (line.id !== id) return [line];
          return [{ ...line, quantity: Math.max(1, Math.min(quantity, line.stockQty, 20)) }];
        }),
      );
    };
    return {
      cart,
      ready,
      notice,
      itemCount: cart.reduce((total, line) => total + line.quantity, 0),
      subtotalMinor: cart.reduce(
        (total, line) => total + line.priceMinor * line.quantity,
        0,
      ),
      addProduct: (product, quantity = 1) => {
        if (!product.stockQty) return;
        setCart((current) => {
          const existing = current.find((line) => line.id === product.id);
          if (!existing) {
            return [
              ...current,
              { ...product, quantity: Math.min(quantity, product.stockQty) },
            ];
          }
          return current.map((line) =>
            line.id === product.id
              ? {
                  ...product,
                  quantity: Math.min(
                    line.quantity + quantity,
                    product.stockQty,
                  ),
                }
              : line,
          );
        });
        setNotice(`${product.name} added to your bag.`);
      },
      updateQuantity,
      removeProduct: (id) => {
        const removed = cart.find((line) => line.id === id);
        setCart((current) => current.filter((line) => line.id !== id));
        if (removed) setNotice(`${removed.name} removed from your bag.`);
      },
      clearCart: () => setCart([]),
      dismissNotice: () => setNotice(""),
    };
  }, [cart, notice, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}
