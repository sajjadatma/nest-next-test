"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PButton, PWordmark } from "@porsche-design-system/components-react/ssr";
import { api, clear, LoginHistoryEvent, Overview } from "@/lib/api";
import { Toast } from "@/components/toast";

export type DashboardView = "overview" | "account" | "access";
type CurrentUser = { id: string; email: string; name?: string | null; roles: string[]; permissions: string[] };
type Role = { key: string; name: string };
type Permission = { key: string; name: string; description?: string | null };
type ManagedUser = { id: string; email: string; name: string | null; roles: { role: Role }[]; permissions: { permission: Permission }[] };

export function formatHistoryTimestamp(timestamp: string, now = new Date()) {
  const event = new Date(timestamp);
  const absolute = event.toLocaleString('en-US');
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate());
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysApart = Math.round((currentDay.getTime() - eventDay.getTime()) / 86_400_000);
  const minutesApart = Math.max(0, Math.floor((now.getTime() - event.getTime()) / 60_000));

  if (daysApart === 1) return `${absolute} | Yesterday`;
  if (minutesApart < 1) return `${absolute} | Just now`;
  if (minutesApart < 60) return `${absolute} | ${minutesApart} minute${minutesApart === 1 ? '' : 's'} ago`;
  const hoursApart = Math.floor(minutesApart / 60);
  return `${absolute} | ${hoursApart} hour${hoursApart === 1 ? '' : 's'} ago`;
}

export function DashboardClient({ view }: { view: DashboardView }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEvent[]>([]);
  const [roles, setRoles] = useState<Role[]>([]); const [permissions, setPermissions] = useState<Permission[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({}); const [draftPermissions, setDraftPermissions] = useState<Record<string, string[]>>({});
  const [profileName, setProfileName] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canManageRoles = (user?.permissions ?? []).includes("roles:manage");

  useEffect(() => {
    api<CurrentUser>("/auth/me").then(async (account) => {
      const normalized = { ...account, roles: account.roles ?? [], permissions: account.permissions ?? [] };
      setUser(normalized); setProfileName(normalized.name ?? "");
      const [overview, history, roleCatalogue, permissionCatalogue, users] = await Promise.all([
        api<Overview>("/dashboard"),
        api<LoginHistoryEvent[]>("/auth/history"),
        normalized.permissions.includes("roles:manage") ? api<Role[]>("/admin/roles") : Promise.resolve([]),
        normalized.permissions.includes("roles:manage") ? api<Permission[]>("/admin/permissions") : Promise.resolve([]),
        normalized.permissions.includes("roles:manage") ? api<ManagedUser[]>("/admin/users") : Promise.resolve([]),
      ]);
      setData(overview); setLoginHistory(history); setRoles(roleCatalogue); setPermissions(permissionCatalogue); setManagedUsers(users);
      setDraftRoles(Object.fromEntries(users.map((member) => [member.id, member.roles.map(({ role }) => role.key)])));
      setDraftPermissions(Object.fromEntries(users.map((member) => [member.id, member.permissions.map(({ permission }) => permission.key)])));
    }).catch(() => { clear(); router.replace("/login"); });
  }, [router]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving("profile"); setMessage(""); setError("");
    try { const updated = await api<CurrentUser>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: profileName }) }); setUser(updated); setMessage("Profile updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update profile."); } finally { setSaving(null); }
  }
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving("password"); setMessage(""); setError("");
    try { await api("/auth/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(""); setNewPassword(""); setMessage("Password updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to change password."); } finally { setSaving(null); }
  }
  async function saveAllAccess() {
    const missingRole = managedUsers.find((member) => !(draftRoles[member.id] ?? []).length);
    if (missingRole) { setError(`${missingRole.email} must retain at least one role.`); return; }
    setSaving("all"); setMessage(""); setError("");
    try {
      await api('/admin/users/access', { method: "PUT", body: JSON.stringify({ assignments: managedUsers.map((member) => ({ userId: member.id, roleKeys: draftRoles[member.id] ?? [], permissionKeys: draftPermissions[member.id] ?? [] })) }) });
      setMessage(`Access updated for ${managedUsers.length} ${managedUsers.length === 1 ? "member" : "members"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update access."); } finally { setSaving(null); }
  }

  if (!user || !data) return <main className="loading"><span className="eyebrow">Loading workspace…</span></main>;
  const name = user.name || user.email.split("@")[0];
  const navigation: { id: DashboardView; href: string; label: string; icon: string; hidden?: boolean }[] = [{ id: "overview", href: "/dashboard", label: "Overview", icon: "◫" }, { id: "account", href: "/dashboard/account", label: "My account", icon: "◎" }, { id: "access", href: "/dashboard/access", label: "Access control", icon: "◇", hidden: !canManageRoles }];
  const toggle = (values: string[], key: string, checked: boolean) => checked ? [...values, key] : values.filter((value) => value !== key);

  return <main className="app-shell">{message && <Toast message={message} variant="success" onDismiss={() => setMessage("")} />}{error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}<aside className="sidebar"><div className="sidebar-brand"><PWordmark /><span>Drive</span></div><nav className="side-nav" aria-label="Workspace navigation">{navigation.filter(({ hidden }) => !hidden).map((item) => <Link key={item.id} href={item.href} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}</Link>)}</nav><div className="sidebar-bottom"><span className="eyebrow">Signed in as</span><strong>{name}</strong><small>{user.email}</small><PButton variant="secondary" onClick={() => { void api('/auth/logout', { method: 'POST' }).catch(() => undefined); clear(); router.replace("/login"); }}>Sign out</PButton></div></aside><section className="workspace"><header className="workspace-header"><div><p className="eyebrow">Drive workspace</p><h1>{view === "overview" ? "Overview" : view === "account" ? "My account" : "Access control"}</h1></div><div className="header-profile"><span className="header-avatar">{name[0].toUpperCase()}</span><span>{name}</span></div></header><div className="workspace-content">
    {view === "overview" && <><section className="welcome-panel"><div><p className="eyebrow">Good to see you</p><h2>Everything is ready<br />for the next move.</h2></div><p>Your workspace is protected by database-backed roles and permissions.</p></section><section className="metric-grid">{data.metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Directory</p><h2>Recently joined</h2></div><span className="status-dot">System operational</span></div><div className="table-wrap"><table className="data-table"><caption className="sr-only">Recently joined members</caption><thead><tr><th scope="col">Member</th><th scope="col">Email address</th><th scope="col">Joined</th></tr></thead><tbody>{data.recentUsers.map((recent) => <tr key={recent.id}><td><span className="person-cell"><span className="avatar">{(recent.name || recent.email)[0].toUpperCase()}</span><strong>{recent.name || "Drive member"}</strong></span></td><td>{recent.email}</td><td><time dateTime={recent.createdAt}>{new Date(recent.createdAt).toLocaleDateString()}</time></td></tr>)}</tbody></table></div></section></>}
    {view === "account" && <><div className="profile-grid"><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Profile details</h2></div></div><form className="settings-form" onSubmit={updateProfile}><label>Full name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={80} /></label><label>Email address<input value={user.email} disabled /></label><div className="access-summary"><span>Roles</span><strong>{user.roles.join(", ") || "user"}</strong><span>Effective permissions</span><strong>{user.permissions.join(" · ") || "None"}</strong></div><PButton type="submit" disabled={saving === "profile"}>{saving === "profile" ? "Saving…" : "Save profile"}</PButton></form></section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Security</p><h2>Change password</h2></div></div><form className="settings-form" onSubmit={updatePassword}><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={8} required /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><p className="manager-note">Use a unique password with at least 8 characters.</p><PButton type="submit" disabled={saving === "password"}>{saving === "password" ? "Updating…" : "Update password"}</PButton></form></section></div><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Account activity</p><h2>Login &amp; signup history</h2></div></div>{loginHistory.length ? <div className="table-wrap"><table className="data-table"><caption className="sr-only">Login and signup history</caption><thead><tr><th scope="col">Event</th><th scope="col">When</th></tr></thead><tbody>{loginHistory.map((event) => <tr key={`${event.action}-${event.createdAt}`}><td><span className={`event-badge ${event.action === "identity.registered" ? "created" : "login"}`}>{event.action === "identity.registered" ? "Account created" : "Signed in"}</span></td><td><time dateTime={event.createdAt}>{formatHistoryTimestamp(event.createdAt)}</time></td></tr>)}</tbody></table></div> : <p className="manager-note">No login or signup events recorded yet.</p>}</section></>}
    {view === "access" && canManageRoles && <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Administration</p><h2>Roles and direct permissions</h2></div><div className="table-actions"><span className="status-dot">roles:manage</span><PButton variant="secondary" disabled={saving === "all"} onClick={() => void saveAllAccess()}>{saving === "all" ? "Saving all…" : "Save all changes"}</PButton></div></div><p className="manager-note">Role permissions are inherited; direct permissions are additional, user-specific grants. Changes are saved together.</p><div className="table-wrap access-table-wrap"><table className="data-table access-table"><caption className="sr-only">User roles and direct permissions</caption><thead><tr><th scope="col">Member</th><th scope="col">Roles</th><th scope="col">Direct permissions</th></tr></thead><tbody>{managedUsers.map((member) => { const userRoles = draftRoles[member.id] ?? []; const userPermissions = draftPermissions[member.id] ?? []; return <tr key={member.id}><td><strong>{member.name || "Drive member"}</strong><small>{member.email}</small></td><td><fieldset><legend className="sr-only">Roles for {member.email}</legend>{roles.map((role) => <label className="role-check" key={role.key}><input type="checkbox" checked={userRoles.includes(role.key)} onChange={(event) => { const checked = event.currentTarget.checked; setDraftRoles((drafts) => ({ ...drafts, [member.id]: toggle(userRoles, role.key, checked) })); }} />{role.name}</label>)}</fieldset></td><td><fieldset><legend className="sr-only">Direct permissions for {member.email}</legend>{permissions.map((permission) => <label className="role-check" key={permission.key}><input type="checkbox" checked={userPermissions.includes(permission.key)} onChange={(event) => { const checked = event.currentTarget.checked; setDraftPermissions((drafts) => ({ ...drafts, [member.id]: toggle(userPermissions, permission.key, checked) })); }} />{permission.name}</label>)}</fieldset></td></tr>; })}</tbody></table></div></section>}
  </div></section></main>;
}
