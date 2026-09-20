"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api, restoreSession } from "@/lib/api";
import type { ProductComment } from "@/components/shop-types";

type ProductCommentsProps = { productId: string; averageRating: number | null; initialCount: number };

export function ProductComments({ productId, averageRating, initialCount }: ProductCommentsProps) {
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ body: string; rating: string }>({ defaultValues: { body: "", rating: "5" } });

  useEffect(() => {
    let active = true;
    api<ProductComment[] | { items: ProductComment[] }>(`/shop/products/${productId}/comments`)
      .then((response) => { if (active) setComments(Array.isArray(response) ? response : response.items); })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  async function submit(values: { body: string; rating: string }) {
    setError("");
    setNotice("");
    try {
      await restoreSession();
      const comment = await api<ProductComment>(`/shop/products/${productId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: values.body.trim(), rating: Number(values.rating) }),
      });
      setComments((current) => [comment, ...current]);
      reset();
      setNotice("Your comment is now part of the conversation.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to post your comment.");
    }
  }

  return (
    <section className="product-comments" aria-labelledby="comments-title">
      <div className="comments-heading">
        <div><p className="shop-kicker">From the community</p><h2 id="comments-title">Notes from daily use.</h2></div>
        <p><strong>{averageRating?.toFixed(1) ?? "New"}</strong><span>{initialCount} {initialCount === 1 ? "comment" : "comments"}</span></p>
      </div>
      <div className="comments-layout">
        <form className="comment-form" onSubmit={handleSubmit(submit)}>
          <h3>Share your experience</h3>
          <p>Comments are available to signed-in customers. <Link href="/login">Sign in</Link></p>
          <label>Rating<select {...register("rating")}><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Fair</option><option value="1">1 — Poor</option></select></label>
          <label>Comment<textarea placeholder="What stood out after using it?" {...register("body", { required: true, minLength: 3, maxLength: 1000 })} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          <button className="shop-primary" disabled={isSubmitting}>{isSubmitting ? "Posting…" : "Post comment"}</button>
        </form>
        <div className="comment-list">
          {loading ? <p>Loading comments…</p> : comments.length ? comments.map((comment) => (
            <article key={comment.id}>
              <header><strong>{comment.authorName ?? comment.author?.name ?? comment.user?.name ?? "NEST customer"}</strong>{comment.rating && <span aria-label={`${comment.rating} out of 5 stars`}>{"★".repeat(comment.rating)}</span>}</header>
              <p>{comment.body}</p>
              <time dateTime={comment.createdAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(comment.createdAt))}</time>
            </article>
          )) : <div className="comments-empty"><h3>Be the first to leave a note.</h3><p>Tell others how this piece fits into your day.</p></div>}
        </div>
      </div>
    </section>
  );
}
