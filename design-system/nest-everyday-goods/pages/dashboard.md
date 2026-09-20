# NEST Operations Dashboard — Page Override

**Parent system:** `../MASTER.md`
**Scope:** Authenticated admin workspace (`/dashboard` and `/dashboard/shop/*`)
**Status:** Approved implementation brief for the dashboard redesign.

## User outcome
Operators should understand workspace health, find the next operational action, and complete catalogue/order/access changes without hunting through dense controls.

## Direction
Operations-first editorial admin: calm, high-signal surfaces with a dark workspace rail, paper content surfaces, compact data tables, and clear status semantics. Keep the customer storefront's natural palette, but increase density and affordance clarity for administration.

## Palette and semantics
- Workspace ink: `#17231c` / `#0c1510`
- Paper: `#f7f5ef`
- Raised surface: `#ffffff`
- Border: `#cbd1c7`
- Muted text: `#526057`
- Accent: `#a16207` or the existing terracotta token when it meets contrast
- Positive: `#32613e` with a non-color label
- Warning: `#755700` with a non-color label
- Error/destructive: `#9d2a1e` with a non-color label

Use semantic CSS tokens. Do not communicate state by color alone.

## Information hierarchy
1. Workspace identity and current page.
2. Primary operational state / key metrics.
3. Next action or attention queue.
4. Detailed table/form controls.
5. Secondary history and governance information.

## Layout
- Desktop: persistent sidebar plus fluid workspace; content max-width around 82rem.
- Tablet: sidebar remains readable; tables use horizontal scroll wrappers; management splits collapse at content-driven breakpoints.
- Mobile: sidebar becomes a compact top navigation/drawer pattern; primary content remains first; controls stack; tables scroll inside bounded containers.
- Preserve 44px minimum interactive targets and visible focus rings.
- Use a consistent 4/8px rhythm and avoid excessive rounded-card decoration.

## Components
- Sidebar: brand, grouped navigation, current user, sign out.
- Workspace header: breadcrumb/section eyebrow, title, current user avatar, mobile menu trigger.
- Overview hero: concise welcome + operational state; avoid overly large marketing typography.
- Metric cards: label, value, supporting context, optional trend/status marker.
- Attention cards: low-stock items, open orders, pending moderation, or access risks.
- Tables: semantic caption/headers, readable density, responsive overflow, row hover/focus, status badges with text.
- Forms: explicit labels, grouped sections, field-level recovery, pending submit labels, input modes for numeric fields.
- Dialogs/drawers: strong scrim, Escape, focus entry and restoration, no background scroll interaction.

## Interaction and states
- Loading: skeleton or clear loading copy that preserves layout.
- Empty: explain what is absent and provide the next safe action.
- Error: `role="alert"`, actionable retry/recovery near the failing region.
- Mutations: disable duplicate submission, show pending label, then success/error announcement.
- Destructive order actions: confirmation dialog with required cancellation reason.
- Mobile nav: keyboard accessible, Escape/outside click, focus restoration.
- Respect `prefers-reduced-motion`; transitions 150–250ms.

## Typography
- Display titles may use the storefront serif sparingly.
- Admin UI/body uses system sans; tabular IDs, statuses, and timestamps may use a monospace treatment.
- Body text remains at least 16px where possible; compact metadata may use 11–12px with sufficient contrast.

## Prohibited changes
- No API route, DTO, auth, permission, mutation, or data-shape changes.
- No new UI dependency or remote font dependency.
- No emoji as interface icons; use CSS/SVG/semantic text.
- Do not hide unauthorized routes as a security control; server permissions remain authoritative.

## Acceptance evidence
- Authenticated dashboard routes preserve existing API calls and mutations.
- Navigation, forms, tables, dialogs, and status states retain behavior.
- Keyboard can reach primary controls; focus is visible and restored after overlays.
- 375px, 768px, and 1440px have no unintended horizontal page overflow.
- Build, lint, typecheck, tests, and live browser probes pass after the final edit.
