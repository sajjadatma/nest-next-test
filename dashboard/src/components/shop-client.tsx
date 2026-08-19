"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const initializedFromUrl = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const initialCategory = params.get("category");
      const initialQuery = params.get("q");
      const initialSort = params.get("sort");
      const initialPage = Number(params.get("page"));
      if (!active) return;
      if (initialCategory) setCategory(initialCategory);
      if (initialQuery) setQuery(initialQuery);
      if (["featured", "price-low", "price-high", "name"].includes(initialSort ?? "")) setSort(initialSort ?? "featured");
      if (params.get("saved") === "1") setFavoritesOnly(true);
      if (Number.isInteger(initialPage) && initialPage > 0) setPage(initialPage);
      initializedFromUrl.current = true;
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!initializedFromUrl.current) return;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    if (sort !== "featured") params.set("sort", sort);
    if (favoritesOnly) params.set("saved", "1");
    if (page > 1) params.set("page", String(page));
    const next = params.toString();
    window.history.replaceState(window.history.state, "", next ? `/shop?${next}` : "/shop");
  }, [category, favoritesOnly, page, query, sort]);

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
  const currentPage = Math.min(page, pageCount);
  const pageProducts = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasActiveFilters = Boolean(category || query.trim() || favoritesOnly || sort !== "featured");
  const activeCategory = categories.find((group) => group.slug === category);

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setFavoritesOnly(false);
    setSort("featured");
    setPage(1);
  }

  function updateFavorite(id: string, favorite: boolean) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, isFavorite: favorite } : product));
  }

  return (
    <main id="main-content">
      <section className="shop-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="shop-kicker">Small objects, well chosen</p>
          <h1 id="hero-title">Make room<br />for better <em>everyday.</em></h1>
          <p>Useful things with quiet character—made to stay in the rotation.</p>
          <a href="#collection" className="shop-cta">
            Shop the collection
            <span className="arrow-mark arrow-down" aria-hidden="true" />
          </a>
        </div>
        <div className="hero-shape" aria-hidden="true"><span /></div>
        <aside className="hero-notes" aria-label="The NEST edit">
          <div><span>01</span><strong>Quiet utility</strong><p>Objects that work hard without asking for attention.</p></div>
          <div><span>02</span><strong>Good materials</strong><p>Honest texture and details that improve with use.</p></div>
        </aside>
      </section>

      {featured.length > 0 && (
        <section className="featured-products" aria-labelledby="featured-title">
          <div className="featured-heading">
            <div>
              <p className="shop-kicker">Within easy reach</p>
              <h2 id="featured-title">Start with these.</h2>
            </div>
            <a href="#collection">See the full collection</a>
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
          <div className="collection-heading">
            <p className="shop-kicker">The current edit</p>
            <h2 id="collection-title">Made for the long run.</h2>
            <p>Browse the full NEST catalogue by what you need, not what is trending.</p>
          </div>
          <div className="collection-search-wrap">
            <label className="shop-search">
              <span>Search the collection</span>
              <input
                value={query}
                onChange={(event) => resetPage(() => setQuery(event.target.value))}
                placeholder="Try “desk” or “travel”"
                type="search"
                aria-label="Search the collection"
              />
            </label>
            {query && <button className="clear-search" type="button" onClick={() => resetPage(() => setQuery(""))}>Clear search</button>}
          </div>
        </div>

        <div className="collection-controls">
          <div className="filter-panel">
            <div className="filter-heading">
              <span>Browse by</span>
              <span className="filter-heading-note">{activeCategory?.name ?? (favoritesOnly ? "Saved pieces" : "All pieces")}</span>
            </div>
            <div className="shop-filters" role="group" aria-label="Filter collection">
              <button type="button" aria-pressed={!category && !favoritesOnly} className={!category && !favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => { setCategory(""); setFavoritesOnly(false); })}>All pieces <span>{products.length}</span></button>
              {categories.map((group) => (
                <button type="button" key={group.slug} aria-pressed={category === group.slug && !favoritesOnly} className={category === group.slug && !favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => { setCategory(group.slug); setFavoritesOnly(false); })}>
                  {group.name} <span>{group._count.products}</span>
                </button>
              ))}
              <button type="button" aria-pressed={favoritesOnly} className={favoritesOnly ? "selected" : ""} onClick={() => resetPage(() => setFavoritesOnly(true))}>
                <span className="saved-mark" aria-hidden="true" /> Saved
              </button>
            </div>
          </div>
          <label className="shop-sort">
            <span>Sort results</span>
            <select aria-label="Sort results" value={sort} onChange={(event) => resetPage(() => setSort(event.target.value))}>
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="collection-summary">
          <p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? "piece" : "pieces"}{products.length !== visible.length && <span> · Showing {visible.length} of {products.length}</span>}</p>
          {hasActiveFilters && <button type="button" className="clear-filters" onClick={clearFilters}>Clear all filters</button>}
        </div>

        {error && <div className="shop-message error" role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div>}
        {loading ? (
          <div className="product-grid product-grid-loading" aria-busy="true" aria-label="Loading products">{Array.from({ length: 8 }, (_, index) => <div className="product-card product-skeleton" key={index} aria-hidden="true" />)}</div>
        ) : pageProducts.length ? (
          <div className="product-grid">
            {pageProducts.map((product) => <ProductCard key={product.id} product={product} onFavoriteChange={(favorite) => updateFavorite(product.id, favorite)} />)}
          </div>
        ) : !error ? (
          <div className="collection-empty" role="status">
            <span className="empty-mark" aria-hidden="true" />
            <h3>No pieces match this edit.</h3>
            <p>Try a broader search or return to the full collection.</p>
            <button type="button" onClick={clearFilters}>Clear all filters</button>
          </div>
        ) : null}
        {pageCount > 1 && (
          <nav className="collection-pagination" aria-label="Collection pages">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><span className="arrow-mark arrow-left" aria-hidden="true" /> Previous</button>
            <span aria-live="polite">Page {currentPage} of {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next <span className="arrow-mark arrow-right" aria-hidden="true" /></button>
          </nav>
        )}
      </section>
      <section className="shop-story" id="about" aria-labelledby="story-title">
        <div><p className="shop-kicker">Fewer, better things</p><h2 id="story-title">Objects should earn their place.</h2></div>
        <p>We look for good material, honest utility, and the kind of detail you notice over time. The aim is not more stuff. It’s the right stuff.</p>
      </section>
    </main>
  );
}
