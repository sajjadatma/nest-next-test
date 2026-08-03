"use client";

import { useState } from "react";
import { api, restoreSession } from "@/lib/api";

type FavoriteButtonProps = {
  productId: string;
  productName: string;
  initialFavorite: boolean;
  onChange?: (favorite: boolean) => void;
};

export function FavoriteButton({
  productId,
  productName,
  initialFavorite,
  onChange,
}: FavoriteButtonProps) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    const next = !favorite;
    setPending(true);
    setMessage("");
    try {
      await restoreSession();
      await api(`/shop/products/${productId}/favorite`, {
        method: next ? "PUT" : "DELETE",
      });
      setFavorite(next);
      onChange?.(next);
      setMessage(next ? "Saved to favorites." : "Removed from favorites.");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Unable to update favorites.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="favorite-control">
      <button
        type="button"
        className={favorite ? "favorite-button selected" : "favorite-button"}
        aria-label={`${favorite ? "Remove" : "Add"} ${productName} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        disabled={pending}
        onClick={toggle}
      >
        <span aria-hidden="true">{favorite ? "♥" : "♡"}</span>
      </button>
      {message && <span className="sr-only" role="status">{message}</span>}
    </span>
  );
}
