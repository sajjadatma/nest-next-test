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

  const action = pending
    ? favorite
      ? "Removing"
      : "Saving"
    : favorite
      ? "Remove"
      : "Add";
  const destination = favorite ? "from" : "to";

  return (
    <span className="favorite-control">
      <button
        type="button"
        className={`favorite-button${favorite ? " selected" : ""}${pending ? " is-pending" : ""}`}
        aria-label={`${action} ${productName} ${destination} favorites`}
        aria-pressed={favorite}
        aria-busy={pending}
        disabled={pending}
        onClick={toggle}
      >
        {pending ? (
          <span className="favorite-spinner" aria-hidden="true" />
        ) : (
          <svg className="favorite-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20.3 3.8 12.6A5.2 5.2 0 0 1 11 5l1 1 1-1a5.2 5.2 0 0 1 7.2 7.6L12 20.3Z" />
          </svg>
        )}
      </button>
      {message && <span className="sr-only" role="status">{message}</span>}
    </span>
  );
}
