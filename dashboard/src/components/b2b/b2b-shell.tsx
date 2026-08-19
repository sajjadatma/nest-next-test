"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { api, clear, restoreSession, token } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/language-provider";

type CurrentUser = { id: string; email: string; name?: string | null; permissions?: string[] };

export function B2bState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <section className="content-card b2b-state" role="status"><span className="eyebrow">B2B workspace</span><h2>{title}</h2><p>{detail}</p>{action}</section>;
}

export function formatB2bMoney(minor: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}

export function B2bShell({ children, title, eyebrow = "B2B workspace", active }: { children: ReactNode; title: string; eyebrow?: string; active?: string }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized">("loading");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        if (!token() && !await restoreSession()) {
          if (mounted) setStatus("unauthorized");
          return;
        }
        const account = await api<CurrentUser>("/auth/me");
        if (!mounted) return;
        setUser(account);
        setStatus("ready");
      } catch {
        clear();
        if (mounted) setStatus("unauthorized");
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (status === "loading") return <main className="dashboard-loading"><span className="eyebrow">{t("Loading workspace…")}</span></main>;
  if (status === "unauthorized") return <main className="workspace-content b2b-page"><B2bState title={t("Sign in to continue") } detail={t("Your business catalogue and company tools are available to authenticated members only.")} action={<Link className="admin-action" href={`/login?redirect=${encodeURIComponent(typeof window === "undefined" ? "/business" : window.location.pathname)}`}>{t("Sign in")}</Link>} /></main>;

  const permissionList = user?.permissions ?? [];
  const canManage = permissionList.includes("shop:manage") || permissionList.includes("shop:b2b:manage");
  const nav = [
    ["companies", t("Companies"), "/dashboard/shop/b2b/companies"],
    ["variants", t("Variants"), "/dashboard/shop/b2b/variants"],
    ["groups", t("Customer groups"), "/dashboard/shop/b2b/customer-groups"],
    ["lists", t("Price lists"), "/dashboard/shop/b2b/price-lists"],
  ];
  return <>
    <a className="skip-link" href="#b2b-main">{t("Skip to main content")}</a>
    <div className="app-shell b2b-page-shell">
      <aside className="sidebar" aria-label={t("B2B management navigation")}>
        <Link href="/dashboard/shop" className="sidebar-brand"><span aria-hidden="true">◼</span><span>{t("Shop management")}</span></Link>
        <nav className="side-nav" aria-label={t("B2B management navigation")}>
          {nav.map(([id, label, href]) => <Link key={id} href={href} className={`nav-item${active === id ? " active" : ""}`} aria-current={active === id ? "page" : undefined}>{label}</Link>)}
          <Link href="/business" className="nav-item">{t("Buyer portal")}</Link>
        </nav>
        <div className="sidebar-bottom"><span className="eyebrow">{t("Signed in as")}</span><strong>{user?.name || user?.email.split("@")[0]}</strong><small>{user?.email}</small><button className="admin-action" type="button" onClick={() => { void api("/auth/logout", { method: "POST" }).catch(() => undefined); clear(); router.replace("/login"); }}>{t("Sign out")}</button></div>
      </aside>
      <section className="workspace">
        <header className="workspace-header"><div><p className="eyebrow">{t(eyebrow)}</p><h1>{t(title)}</h1></div><Link className="b2b-header-link" href="/dashboard/shop">{t("Back to shop management")}</Link></header>
        <main id="b2b-main" className="workspace-content">{!canManage && <B2bState title={t("Management access required")} detail={t("Your account is signed in, but it does not have permission to manage B2B settings.")} />}{canManage && children}</main>
      </section>
    </div>
    <style jsx global>{`
      .b2b-page-shell .sidebar-brand { text-decoration: none; }
      .b2b-page-shell .sidebar-brand span:first-child { color: var(--dashboard-accent); font-size: .7rem; }
      .b2b-header-link { color: var(--dashboard-muted); font-size: .76rem; font-weight: 700; text-decoration: underline; text-underline-offset: .25rem; }
      .b2b-page { min-height: 100vh; display: grid; place-items: center; padding: 1.25rem; background: var(--nest-paper); }
      .b2b-state { max-width: 40rem; margin: 0 auto; }
      .b2b-state h2 { margin: .45rem 0 .65rem; font-size: clamp(1.6rem, 3vw, 2.4rem); letter-spacing: -.05em; }
      .b2b-state p { max-width: 34rem; color: var(--dashboard-muted); line-height: 1.6; }
      .b2b-page-shell .admin-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; text-decoration: none; }
      .b2b-page-shell .content-card { margin-top: 0; }
      .b2b-page-shell .section-heading { align-items: flex-start; }
      .b2b-page-shell .data-table { min-width: 50rem; }
      .b2b-page-shell .data-table td strong, .b2b-page-shell .data-table td small { display: block; }
      .b2b-page-shell .data-table td small { margin-top: .25rem; color: var(--dashboard-muted); font-size: .75rem; }
      .b2b-page-shell .b2b-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .b2b-page-shell .b2b-toolbar form { display: flex; align-items: end; gap: .6rem; flex: 1; }
      .b2b-page-shell .b2b-toolbar label, .b2b-page-shell .b2b-form label { display: grid; gap: .35rem; color: var(--dashboard-muted); font-size: .72rem; font-weight: 700; }
      .b2b-page-shell .b2b-toolbar input, .b2b-page-shell .b2b-form input, .b2b-page-shell .b2b-form select { min-height: 44px; border: 1px solid var(--dashboard-line); background: var(--dashboard-raised); padding: .6rem .7rem; color: inherit; font: inherit; }
      .b2b-page-shell .b2b-form { display: grid; gap: .8rem; }
      .b2b-page-shell .b2b-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
      .b2b-page-shell .b2b-form-actions { display: flex; gap: .6rem; align-items: center; margin-top: .4rem; }
      .b2b-page-shell .b2b-form-actions button { min-height: 44px; }
      .b2b-page-shell .b2b-inline-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
      .b2b-page-shell .b2b-inline-actions button, .b2b-page-shell .b2b-inline-actions a { min-height: 40px; }
      .b2b-page-shell .b2b-muted { color: var(--dashboard-muted); font-size: .78rem; }
      .b2b-page-shell .b2b-badge { display: inline-flex; border: 1px solid var(--dashboard-line); border-radius: 999px; padding: .3rem .55rem; font-size: .7rem; font-weight: 700; }
      .b2b-page-shell .b2b-badge.active { background: #edf6e8; color: var(--dashboard-success); }
      .b2b-page-shell .b2b-badge.suspended, .b2b-page-shell .b2b-badge.archived { background: #fff0ee; color: var(--dashboard-danger); }
      .b2b-page-shell .b2b-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin: 0 0 1rem; }
      .b2b-page-shell .b2b-stat-grid .metric-card { min-height: 7rem; }
      @media (max-width: 720px) { .b2b-page-shell .b2b-toolbar { align-items: stretch; flex-direction: column; } .b2b-page-shell .b2b-toolbar form { flex-direction: column; align-items: stretch; } .b2b-page-shell .b2b-form-grid { grid-template-columns: 1fr; } .b2b-header-link { display: none; } }
    `}</style>
  </>;
}
