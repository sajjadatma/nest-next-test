"use client";

import { create } from "zustand";
import type { CartLine, Product } from "@/components/shop-types";

const STORAGE_KEY = "nest-shop-cart-v2";

type CartState = {
  cart: CartLine[];
  ready: boolean;
  notice: string;
  hydrate: () => void;
  addProduct: (product: Product, quantity?: number) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeProduct: (id: string) => void;
  clearCart: () => void;
  dismissNotice: () => void;
};

function persist(cart: CartLine[]) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function loadCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("nest-shop-cart");
    return saved ? JSON.parse(saved) as CartLine[] : [];
  } catch {
    return [];
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: [],
  ready: false,
  notice: "",
  hydrate: () => set({ cart: loadCart(), ready: true }),
  addProduct: (product, quantity = 1) => {
    if (!product.stockQty) return;
    const current = get().cart;
    const existing = current.find((line) => line.id === product.id);
    const cart = existing
      ? current.map((line) => line.id === product.id ? { ...product, quantity: Math.min(line.quantity + quantity, product.stockQty, 20) } : line)
      : [...current, { ...product, quantity: Math.min(quantity, product.stockQty, 20) }];
    persist(cart);
    set({ cart, notice: `${product.name} added to your bag.` });
  },
  updateQuantity: (id, quantity) => {
    const cart = get().cart.map((line) => line.id === id ? { ...line, quantity: Math.max(1, Math.min(quantity, line.stockQty, 20)) } : line);
    persist(cart);
    set({ cart });
  },
  removeProduct: (id) => {
    const removed = get().cart.find((line) => line.id === id);
    const cart = get().cart.filter((line) => line.id !== id);
    persist(cart);
    set({ cart, notice: removed ? `${removed.name} removed from your bag.` : get().notice });
  },
  clearCart: () => { persist([]); set({ cart: [] }); },
  dismissNotice: () => set({ notice: "" }),
}));
