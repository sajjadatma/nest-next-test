"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  variant: "success" | "error";
  onDismiss: () => void;
};

export function Toast({ message, variant, onDismiss }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  return <aside className={`toast ${variant}`} role={variant === "error" ? "alert" : "status"} aria-live={variant === "error" ? "assertive" : "polite"}>
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>
  </aside>;
}
