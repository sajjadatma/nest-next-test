"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PButton,
  PWordmark,
} from "@porsche-design-system/components-react/ssr";
import { api, clear, LoginHistoryEvent, Overview, restoreSession, token } from "@/lib/api";
import { Toast } from "@/components/toast";
import { SystemLogsPanel } from "@/components/system-logs-panel";
import { ShopAdminPanel } from "@/components/shop-admin-panel";
import { CustomerOrdersPanel } from "@/components/customer-orders-panel";
import { ShopSection } from "@/components/shop-admin-types";

export type DashboardView = "overview" | "account" | "access" | "logs" | "shop";
type CurrentUser = {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};
type Role = { key: string; name: string };
type Permission = { key: string; name: string; description?: string | null };
type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  roles: { role: Role }[];
  permissions: { permission: Permission }[];
};

type NavigationIconName = "overview" | "shop" | "account" | "access" | "logs";

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10.5h16v9H4z" />
        <path d="M5 10.5 6.5 4h11l1.5 6.5M9 10.5v9M15 10.5v9" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.9-3.1 3.1-4.7 7-4.7s6.1 1.6 7 4.7" />
      </>
    ),
    access: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3.5 20c.5-3.1 2-4.7 4.5-4.7s4 1.6 4.5 4.7M13 20c.3-2.2 1.5-3.4 3.7-3.4 2.1 0 3.3 1.2 3.8 3.4" />
      </>
    ),
    logs: (
      <>
        <path d="M5 4.5h14v15H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="nav-item-icon"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function formatHistoryTimestamp(timestamp: string, now = new Date()) {
  const event = new Date(timestamp);
  const absolute = event.toLocaleString("en-US");
  const eventDay = new Date(
    event.getFullYear(),
    event.getMonth(),
    event.getDate(),
  );
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysApart = Math.round(
    (currentDay.getTime() - eventDay.getTime()) / 86_400_000,
  );
  const minutesApart = Math.max(
    0,
    Math.floor((now.getTime() - event.getTime()) / 60_000),
  );

  if (daysApart === 1) return `${absolute} | Yesterday`;
  if (minutesApart < 1) return `${absolute} | Just now`;
  if (minutesApart < 60)
    return `${absolute} | ${minutesApart} minute${minutesApart === 1 ? "" : "s"} ago`;
  const hoursApart = Math.floor(minutesApart / 60);
  return `${absolute} | ${hoursApart} hour${hoursApart === 1 ? "" : "s"} ago`;
}

export function DashboardClient({
  view,
  shopSection = "overview",
}: {
  view: DashboardView;
  shopSection?: ShopSection;
}) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEvent[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});
  const [draftPermissions, setDraftPermissions] = useState<
    Record<string, string[]>
  >({});
  const profileForm = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const passwordForm = useForm<{ currentPassword: string; newPassword: string }>({ defaultValues: { currentPassword: "", newPassword: "" } });
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  const wasMobileNavOpen = useRef(false);
  const canManageRoles = (user?.permissions ?? []).includes("roles:manage");
  const canViewLogs = (user?.permissions ?? []).includes("system-logs:read");
  const canManageShop = (user?.permissions ?? []).some((permission) => permission === "shop:manage" || permission.startsWith("shop:"));

  useEffect(() => {
    if (!mobileNavOpen) {
      if (wasMobileNavOpen.current) {
        mobileNavToggleRef.current?.focus();
        wasMobileNavOpen.current = false;
      }
      return;
    }

    const firstFocusable = mobileNavRef.current?.querySelector<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    firstFocusable?.focus();
    wasMobileNavOpen.current = true;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = mobileNavRef.current
        ? [...mobileNavRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")]
        : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !mobileNavRef.current?.contains(target) &&
        !mobileNavToggleRef.current?.contains(target)
      ) {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!token() && !await restoreSession()) {
          clear();
          if (active) router.replace("/login");
          return;
        }
        const account = await api<CurrentUser>("/auth/me");
        const normalized = {
          ...account,
          roles: account.roles ?? [],
          permissions: account.permissions ?? [],
        };
        if (!active) return;
        setUser(normalized);
        profileForm.reset({ name: normalized.name ?? "" });
        const [overview, history, roleCatalogue, permissionCatalogue, users] =
          await Promise.all([
            api<Overview>("/dashboard"),
            api<LoginHistoryEvent[]>("/auth/history"),
            normalized.permissions.includes("roles:manage")
              ? api<Role[]>("/admin/roles")
              : Promise.resolve([]),
            normalized.permissions.includes("roles:manage")
              ? api<Permission[]>("/admin/permissions")
              : Promise.resolve([]),
            normalized.permissions.includes("roles:manage")
              ? api<ManagedUser[]>("/admin/users")
              : Promise.resolve([]),
          ]);
        setData(overview);
        setLoginHistory(history);
        setRoles(roleCatalogue);
        setPermissions(permissionCatalogue);
        setManagedUsers(users);
        setDraftRoles(
          Object.fromEntries(
            users.map((member) => [
              member.id,
              member.roles.map(({ role }) => role.key),
            ]),
          ),
        );
        setDraftPermissions(
          Object.fromEntries(
            users.map((member) => [
              member.id,
              member.permissions.map(({ permission }) => permission.key),
            ]),
          ),
        );
      } catch {
        clear();
        if (active) router.replace("/login");
      }
    })();
    return () => { active = false; };
  }, [profileForm, router]);

  async function updateProfile(values: { name: string }) {
    setSaving("profile");
    setMessage("");
    setError("");
    try {
      const updated = await api<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: values.name }),
      });
      setUser(updated);
      setMessage("Profile updated.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update profile.",
      );
    } finally {
      setSaving(null);
    }
  }
  async function updatePassword(values: { currentPassword: string; newPassword: string }) {
    setSaving("password");
    setMessage("");
    setError("");
    try {
      await api("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      passwordForm.reset();
      setMessage("Password updated.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to change password.",
      );
    } finally {
      setSaving(null);
    }
  }
  async function saveAllAccess() {
    const missingRole = managedUsers.find(
      (member) => !(draftRoles[member.id] ?? []).length,
    );
    if (missingRole) {
      setError(`${missingRole.email} must retain at least one role.`);
      return;
    }
    setSaving("all");
    setMessage("");
    setError("");
    try {
      await api("/admin/users/access", {
        method: "PUT",
        body: JSON.stringify({
          assignments: managedUsers.map((member) => ({
            userId: member.id,
            roleKeys: draftRoles[member.id] ?? [],
            permissionKeys: draftPermissions[member.id] ?? [],
          })),
        }),
      });
      setMessage(
        `Access updated for ${managedUsers.length} ${managedUsers.length === 1 ? "member" : "members"}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update access.",
      );
    } finally {
      setSaving(null);
    }
  }

  if (!user || !data)
    return (
      <main className="loading dashboard-loading" aria-busy="true">
        <span className="eyebrow" role="status">Loading workspace…</span>
      </main>
    );
  const name = user.name || user.email.split("@")[0];
  const navigation: {
    id: DashboardView;
    href: string;
    label: string;
    icon: NavigationIconName;
    hidden?: boolean;
  }[] = [
    { id: "overview", href: "/dashboard", label: "Overview", icon: "overview" },
    {
      id: "shop",
      href: "/dashboard/shop",
      label: "Shop management",
      icon: "shop",
      hidden: !canManageShop,
    },
    {
      id: "account",
      href: "/dashboard/account",
      label: "My account",
      icon: "account",
    },
    {
      id: "access",
      href: "/dashboard/access",
      label: "Access control",
      icon: "access",
      hidden: !canManageRoles,
    },
    {
      id: "logs",
      href: "/dashboard/logs",
      label: "System logs",
      icon: "logs",
      hidden: !canViewLogs,
    },
  ];
  const toggle = (values: string[], key: string, checked: boolean) =>
    checked ? [...values, key] : values.filter((value) => value !== key);

  return (
    <>
      <a className="skip-link" href="#dashboard-main">
        Skip to main content
      </a>
      <div className="app-shell">
      {message && (
        <Toast
          message={message}
          variant="success"
          onDismiss={() => setMessage("")}
        />
      )}
      {error && (
        <Toast message={error} variant="error" onDismiss={() => setError("")} />
      )}
      <aside
        ref={mobileNavRef}
        className={`sidebar${mobileNavOpen ? " is-open" : ""}`}
        id="dashboard-mobile-nav"
        aria-label="Workspace navigation"
      >
        <div className="sidebar-mobile-head">
          <span className="eyebrow">Workspace menu</span>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close workspace navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="close-mark" aria-hidden="true" />
          </button>
        </div>
        <div className="sidebar-brand">
          <PWordmark />
          <span>Drive</span>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation
            .filter(({ hidden }) => !hidden)
            .map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={view === item.id ? "nav-item active" : "nav-item"}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
              >
                <NavigationIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="eyebrow">Signed in as</span>
          <strong>{name}</strong>
          <small>{user.email}</small>
          <PButton
            variant="secondary"
            onClick={() => {
              void api("/auth/logout", { method: "POST" }).catch(
                () => undefined,
              );
              clear();
              router.replace("/login");
            }}
          >
            Sign out
          </PButton>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          className="mobile-nav-scrim"
          type="button"
          aria-label="Close workspace navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-heading">
            <button
              ref={mobileNavToggleRef}
              className="mobile-nav-toggle"
              type="button"
              aria-expanded={mobileNavOpen}
              aria-controls="dashboard-mobile-nav"
              aria-label={`${mobileNavOpen ? "Close" : "Open"} workspace navigation`}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="menu-toggle-mark" aria-hidden="true" />
              <span className="mobile-nav-toggle-label">{mobileNavOpen ? "Close" : "Menu"}</span>
            </button>
            <div>
            <p className="eyebrow">Drive workspace</p>
            <h1>
              {view === "overview"
                ? "Overview"
                : view === "shop"
                  ? "Shop management"
                  : view === "account"
                    ? "My account"
                    : view === "access"
                      ? "Access control"
                      : "System logs"}
            </h1>
            </div>
          </div>
          <div className="header-profile">
            <span className="header-avatar">{name[0].toUpperCase()}</span>
            <span>{name}</span>
          </div>
        </header>
        <main id="dashboard-main" className="workspace-content">
          {view === "overview" && (
            <>
              <section className="welcome-panel">
                <div>
                  <p className="eyebrow">Good to see you</p>
                  <h2>
                    Everything is ready
                    <br />
                    for the next move.
                  </h2>
                </div>
                <p>
                  Your workspace is protected by database-backed roles and
                  permissions.
                </p>
              </section>
              <section className="metric-grid">
                {data.metrics.map((metric) => (
                  <article className="metric-card" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </section>
              <section className="content-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Directory</p>
                    <h2>Recently joined</h2>
                  </div>
                  <span className="status-dot">System operational</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <caption className="sr-only">
                      Recently joined members
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Member</th>
                        <th scope="col">Email address</th>
                        <th scope="col">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentUsers.map((recent) => (
                        <tr key={recent.id}>
                          <td>
                            <span className="person-cell">
                              <span className="avatar">
                                {(recent.name || recent.email)[0].toUpperCase()}
                              </span>
                              <strong>{recent.name || "Drive member"}</strong>
                            </span>
                          </td>
                          <td>{recent.email}</td>
                          <td>
                            <time dateTime={recent.createdAt}>
                              {new Date(recent.createdAt).toLocaleDateString()}
                            </time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {view === "account" && (
            <>
              <div className="profile-grid">
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Identity</p>
                      <h2>Profile details</h2>
                    </div>
                  </div>
                  <form className="settings-form" onSubmit={profileForm.handleSubmit(updateProfile)}>
                    <label>
                      Full name
                      <input
                        maxLength={80}
                        {...profileForm.register("name")}
                      />
                    </label>
                    <label>
                      Email address
                      <input value={user.email} disabled />
                    </label>
                    <div className="access-summary">
                      <span>Roles</span>
                      <strong>{user.roles.join(", ") || "user"}</strong>
                      <span>Effective permissions</span>
                      <strong>{user.permissions.join(" · ") || "None"}</strong>
                    </div>
                    <PButton type="submit" disabled={saving === "profile"}>
                      {saving === "profile" ? "Saving…" : "Save profile"}
                    </PButton>
                  </form>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Security</p>
                      <h2>Change password</h2>
                    </div>
                  </div>
                  <form className="settings-form" onSubmit={passwordForm.handleSubmit(updatePassword)}>
                    <label>
                      Current password
                      <input
                        type="password"
                        minLength={8}
                        required
                        {...passwordForm.register("currentPassword", { required: true, minLength: 8 })}
                      />
                    </label>
                    <label>
                      New password
                      <input
                        type="password"
                        minLength={8}
                        required
                        {...passwordForm.register("newPassword", { required: true, minLength: 8 })}
                      />
                    </label>
                    <p className="manager-note">
                      Use a unique password with at least 8 characters.
                    </p>
                    <PButton type="submit" disabled={saving === "password"}>
                      {saving === "password" ? "Updating…" : "Update password"}
                    </PButton>
                  </form>
                </section>
              </div>
              <section className="content-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Account activity</p>
                    <h2>Login &amp; signup history</h2>
                  </div>
                </div>
                {loginHistory.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <caption className="sr-only">
                        Login and signup history
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Event</th>
                          <th scope="col">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loginHistory.map((event) => (
                          <tr key={`${event.action}-${event.createdAt}`}>
                            <td>
                              <span
                                className={`event-badge ${event.action === "identity.registered" ? "created" : "login"}`}
                              >
                                {event.action === "identity.registered"
                                  ? "Account created"
                                  : "Signed in"}
                              </span>
                            </td>
                            <td>
                              <time dateTime={event.createdAt}>
                                {formatHistoryTimestamp(event.createdAt)}
                              </time>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="manager-note">
                    No login or signup events recorded yet.
                  </p>
                )}
              </section>
              <CustomerOrdersPanel />
            </>
          )}
          {view === "access" && canManageRoles && (
            <section className="content-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Administration</p>
                  <h2>Roles and direct permissions</h2>
                </div>
                <div className="table-actions">
                  <span className="status-dot">roles:manage</span>
                  <PButton
                    variant="secondary"
                    disabled={saving === "all"}
                    onClick={() => void saveAllAccess()}
                  >
                    {saving === "all" ? "Saving all…" : "Save all changes"}
                  </PButton>
                </div>
              </div>
              <p className="manager-note">
                Role permissions are inherited; direct permissions are
                additional, user-specific grants. Changes are saved together.
              </p>
              <div className="table-wrap access-table-wrap">
                <table className="data-table access-table">
                  <caption className="sr-only">
                    User roles and direct permissions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Member</th>
                      <th scope="col">Roles</th>
                      <th scope="col">Direct permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedUsers.map((member) => {
                      const userRoles = draftRoles[member.id] ?? [];
                      const userPermissions = draftPermissions[member.id] ?? [];
                      return (
                        <tr key={member.id}>
                          <td>
                            <strong>{member.name || "Drive member"}</strong>
                            <small>{member.email}</small>
                          </td>
                          <td>
                            <fieldset>
                              <legend className="sr-only">
                                Roles for {member.email}
                              </legend>
                              {roles.map((role) => (
                                <label className="role-check" key={role.key}>
                                  <input
                                    type="checkbox"
                                    checked={userRoles.includes(role.key)}
                                    onChange={(event) => {
                                      const checked =
                                        event.currentTarget.checked;
                                      setDraftRoles((drafts) => ({
                                        ...drafts,
                                        [member.id]: toggle(
                                          userRoles,
                                          role.key,
                                          checked,
                                        ),
                                      }));
                                    }}
                                  />
                                  {role.name}
                                </label>
                              ))}
                            </fieldset>
                          </td>
                          <td>
                            <fieldset>
                              <legend className="sr-only">
                                Direct permissions for {member.email}
                              </legend>
                              {permissions.map((permission) => (
                                <label
                                  className="role-check"
                                  key={permission.key}
                                >
                                  <input
                                    type="checkbox"
                                    checked={userPermissions.includes(
                                      permission.key,
                                    )}
                                    onChange={(event) => {
                                      const checked =
                                        event.currentTarget.checked;
                                      setDraftPermissions((drafts) => ({
                                        ...drafts,
                                        [member.id]: toggle(
                                          userPermissions,
                                          permission.key,
                                          checked,
                                        ),
                                      }));
                                    }}
                                  />
                                  {permission.name}
                                </label>
                              ))}
                            </fieldset>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {view === "logs" && canViewLogs && <SystemLogsPanel />}
          {view === "shop" && canManageShop && (
            <ShopAdminPanel section={shopSection} permissions={user.permissions} />
          )}
        </main>
      </section>
      </div>
    </>
  );
}
