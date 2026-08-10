# NEST Everyday Goods — UI Design System

**Status:** Approved implementation brief for the customer storefront redesign.
**Product:** Editorial ecommerce for useful everyday goods.
**Stack:** Next.js 16 / React 19 / TypeScript / CSS tokens.

## Direction

Nature Distilled + editorial minimalism: muted earthy color, warm paper surfaces, high-contrast serif display type, practical sans-serif UI labels, calm spacing, and restrained motion. The interface should feel tactile and considered—not glossy, noisy, or overly rounded.

## Palette

```css
--nest-ink: #17231c;          /* primary text / dark surfaces */
--nest-ink-soft: #4f5d53;     /* readable secondary text */
--nest-paper: #f7f5ef;        /* page background */
--nest-paper-deep: #eee9df;   /* secondary surface */
--nest-sage: #d5e3ca;         /* hero / trust section */
--nest-sage-deep: #789569;    /* hero art */
--nest-terracotta: #a85432;   /* interaction accent; WCAG-safe on paper */
--nest-sand: #d4c4a8;         /* product-art support */
--nest-line: #cbd1c7;         /* dividers */
--nest-muted: #607061;        /* secondary labels */
```

Use semantic tokens instead of raw hex values in components. Body text must maintain at least 4.5:1 contrast; focus uses a 3px terracotta ring.

## Type

- Display: Georgia / system serif, `font-weight: 400`, tight tracking for editorial headlines.
- UI/body: Arial / system sans, minimum 16px for comfortable reading; compact uppercase labels may be 11–12px.
- Use uppercase labels only for metadata, filters, and actions—not paragraphs.

## Layout

- Content max-width: 90rem.
- Desktop gutters: `clamp(1.25rem, 5vw, 5rem)`.
- Spacing rhythm: `.35rem / .65rem / 1rem / 1.5rem / 2rem / 3rem`.
- Product grid: 4 columns wide, 2 columns tablet, horizontal snap rail on narrow phones.
- Preserve a clear primary CTA in the hero and a persistent, obvious bag action.

## Interaction rules

- Native links/buttons for all actions; visible focus rings.
- Touch targets at least 44×44px.
- Hover/focus transitions 150–250ms; no layout-shifting transforms.
- Respect `prefers-reduced-motion`.
- Favorite controls use an SVG/CSS heart shape and an accessible pressed state; no emoji glyphs as structural icons.
- Search and filters preserve URL state, reset pagination, and provide a useful empty state with recovery.
- Mobile navigation must support Escape, outside click, and focus-safe disclosure.
- Add-to-bag must communicate pending/success via the existing cart notice and never silently fail.

## Product imagery

Seed data includes external Unsplash URLs that may be unavailable in restricted environments. Keep real URLs when reachable; when a URL is the known unavailable seed source, render deterministic local branded product art keyed by product category/name. Never show the same generic OG image for every item.

## Motion

Use subtle fade/translate-up reveal only where it improves hierarchy. Keep movement 8–16px and 150–300ms. Do not hide core content from crawlers or users without JavaScript.

## UX acceptance checklist

- [ ] Hero message, collection CTA, and bag action are clear above the fold.
- [ ] Product images/cards remain distinct and understandable without external image access.
- [ ] Search, category filters, saved filter, sort, result count, empty, loading, and error states are coherent.
- [ ] Mobile navigation and filter controls are usable at 375px.
- [ ] All interactive controls have accessible names, focus, and pressed/disabled states.
- [ ] No horizontal overflow at 375px, 768px, 1024px, or 1440px.
- [ ] Backend routes, product contracts, and checkout behavior remain unchanged.
