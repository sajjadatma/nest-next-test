"use client";

import { useEffect, useMemo, useState } from "react";
import { api, restoreSession } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
import type { Category, Product } from "@/components/shop-types";

const PAGE_SIZE = 12;

export function ShopClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      const initialCategory = new URLSearchParams(window.location.search).get("category");
      if (active && initialCategory) setCategory(initialCategory);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        await restoreSession();
        const [items, groups] = await Promise.all([
          api<Product[]>("/shop/products"),
          api<Category[]>("/shop/categories"),
        ]);
        if (active) {
          setProducts(items);
          setCategories(groups);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load the collection.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const featured = useMemo(
    () =>
      [...products]
        .filter((product) => product.featuredRank != null)
        .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999))
        .slice(0, 4),
    [products],
  );

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          (!category || product.category.slug === category) &&
          (!favoritesOnly || product.isFavorite) &&
          (!normalizedQuery ||
            `${product.name} ${product.description} ${product.material ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery)),
      )
      .sort((a, b) => {
        if (sort === "price-low") return a.priceMinor - b.priceMinor;
        if (sort === "price-high") return b.priceMinor - a.priceMinor;
        if (sort === "name") return a.name.localeCompare(b.name);
        return (a.featuredRank ?? 999) - (b.featuredRank ?? 999);
      });
  }, [category, favoritesOnly, products, query, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageProducts = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  function updateFavorite(id: string, favorite: boolean) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, isFavorite: favorite } : product));
  }

  return (
    <main>
      <section className="shop-hero">
        <p className="shop-kicker">Small objects, well chosen</p>
        <h1>Make room<br />for better <em>everyday.</em></h1>
        <p>Useful things with quiet character—made to stay in the rotation.</p>
        <a href="#collection" className="shop-cta">Shop the collection <span>↓</span></a>
        <div className="hero-shape" aria-hidden><span /></div>
      </section>

      {featured.length > 0 && (
        <section className="featured-products" aria-labelledby="featured-title">
          <div className="featured-heading">
            <div>
              <p className="shop-kicker">Within easy reach</p>
              <h2 id="featured-title">Start with these.</h2>
            </div>
            <a href="#collection">See the full collection ↓</a>
          </div>
          <div className="featured-grid">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} compact onFavoriteChange={(favorite) => updateFavorite(product.id, favorite)} />
            ))}
          </div>
        </section>
      )}

      <section className="shop-collection" id="collection" aria-labelledby="collection-title">
        <div className="collection-top">
          <div>
            <p className="shop-kicker">The current edit</p>
            <h2 id="collection-title">Made for the long run.</h2>
          </div>
          <label className="shop-search">
            <span>Search</span>
            <input value={query} onChange={(event) => resetPage(() => setQuery(event.target.value))} placeholder="Search the collection" type="search" />
          </label>
        </div>
        <div className="collection-controls">
          <div className="shop-filters" aria-label="Filter collection">
            <button className={!category && !favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => { setCategory(""); setFavoritesOnly(false); })}>All pieces <span>{products.length}</span></button>
            {categories.map((group) => (
              <button key={group.slug} className={category === group.slug && !favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => { setCategory(group.slug); setFavoritesOnly(false); })}>
                {group.name} <span>{group._count.products}</span>
              </button>
            ))}
            <button className={favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => setFavoritesOnly(true))}>♥ Saved</button>
          </div>
          <label className="shop-sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => resetPage(() => setSort(event.target.value))}>
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        <p className="collection-result" aria-live="polite">{visible.length} {visible.length === 1 ? "piece" : "pieces"}</p>
        {error && <div className="shop-message error" role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div>}
        {loading ? (
          <div className="product-grid" aria-label="Loading products">{Array.from({ length: 8 }, (_, index) => <div className="product-card product-skeleton" key={index} />)}</div>
        ) : pageProducts.length ? (
          <div className="product-grid">
            {pageProducts.map((product) => <ProductCard key={product.id} product={product} onFavoriteChange={(favorite) => updateFavorite(product.id, favorite)} />)}
          </div>
        ) : !error ? (
          <div className="collection-empty"><h3>No pieces match.</h3><p>Try a different search or clear your filters.</p><button onClick={() => { setQuery(""); setCategory(""); setFavoritesOnly(false); setPage(1); }}>Clear filters</button></div>
        ) : null}
        {pageCount > 1 && (
          <nav className="collection-pagination" aria-label="Collection pages">
            <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next →</button>
          </nav>
        )}
      </section>
      <section className="shop-story" id="about">
        <div><p className="shop-kicker">Fewer, better things</p><h2>Objects should earn their place.</h2></div>
        <p>We look for good material, honest utility, and the kind of detail you notice over time. The aim is not more stuff. It’s the right stuff.</p>
      </section>
    </main>
  );
}
