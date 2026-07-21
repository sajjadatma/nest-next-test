"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PButton, PWordmark } from "@porsche-design-system/components-react/ssr";
import { api, clear, Overview, token } from "@/lib/api";

type View = "overview" | "account" | "access";
type CurrentUser = { id: string; email: string; name?: string | null; roles: string[]; permissions: string[] };
type Role = { key: string; name: string; permissions: { permission: { key: string; name: string } }[] };
type ManagedUser = { id: string; email: string; name: string | null; roles: { role: { key: string; name: string } }[] };

export function DashboardClient() {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canManageRoles = (user?.permissions ?? []).includes("roles:manage");

  useEffect(() => {
    if (!token()) { router.replace("/login"); return; }
    api<CurrentUser>("/auth/me").then(async (account) => {
      const normalizedAccount = { ...account, roles: account.roles ?? [], permissions: account.permissions ?? [] };
      setUser(normalizedAccount);
      const [overview, roleCatalogue, users] = await Promise.all([
        api<Overview>("/dashboard"),
        normalizedAccount.permissions.includes("roles:manage") ? api<Role[]>("/admin/roles") : Promise.resolve([]),
        normalizedAccount.permissions.includes("roles:manage") ? api<ManagedUser[]>("/admin/users") : Promise.resolve([]),
      ]);
      setData(overview); setRoles(roleCatalogue); setManagedUsers(users);
      setDraftRoles(Object.fromEntries(users.map((member) => [member.id, member.roles.map(({ role }) => role.key)])));
    }).catch(() => { clear(); router.replace("/login"); });
  }, [router]);

  async function saveRoles(member: ManagedUser) {
    const roleKeys = draftRoles[member.id] ?? [];
    if (!roleKeys.length) { setError("Every account must retain at least one role."); return; }
    setSaving(member.id); setError("");
    try {
      await api(`/admin/users/${member.id}/roles`, { method: "PUT", body: JSON.stringify({ roleKeys }) });
      setManagedUsers((members) => members.map((item) => item.id === member.id ? { ...item, roles: roleKeys.map((key) => ({ role: { key, name: roles.find((role) => role.key === key)?.name ?? key } })) } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update roles."); } finally { setSaving(null); }
  }

  if (!user || !data) return <main className="loading"><span className="eyebrow">Loading workspace…</span></main>;
  const name = user.name || user.email.split("@")[0];
  const navigation: { id: View; label: string; icon: string; hidden?: boolean }[] = [
    { id: "overview", label: "Overview", icon: "◫" },
    { id: "account", label: "My account", icon: "◎" },
    { id: "access", label: "Access control", icon: "◇", hidden: !canManageRoles },
  ];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><PWordmark /><span>Drive</span></div>
      <nav className="side-nav" aria-label="Workspace navigation">{navigation.filter(({ hidden }) => !hidden).map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="eyebrow">Signed in as</span><strong>{name}</strong><small>{user.email}</small><PButton variant="secondary" onClick={() => { clear(); router.replace("/login"); }}>Sign out</PButton></div>
    </aside>
    <section className="workspace">
      <header className="workspace-header"><div><p className="eyebrow">Drive workspace</p><h1>{view === "overview" ? "Overview" : view === "account" ? "My account" : "Access control"}</h1></div><div className="header-profile"><span className="header-avatar">{name[0].toUpperCase()}</span><span>{name}</span></div></header>
      <div className="workspace-content">
        {view === "overview" && <><section className="welcome-panel"><div><p className="eyebrow">Good to see you</p><h2>Everything is ready<br />for the next move.</h2></div><p>Your workspace is protected by database-backed roles and permissions.</p></section><section className="metric-grid">{data.metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Directory</p><h2>Recently joined</h2></div><span className="status-dot">System operational</span></div><div className="table-head"><span>Member</span><span>Role</span><span>Joined</span></div>{data.recentUsers.map((recent) => <div className="member-row" key={recent.id}><span className="avatar">{(recent.name || recent.email)[0].toUpperCase()}</span><span><strong>{recent.name || "Drive member"}</strong><small>{recent.email}</small></span><span className="role-pill">Member</span><time>{new Date(recent.createdAt).toLocaleDateString()}</time></div>)}</section></>}
        {view === "account" && <section className="content-card account-card"><div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Your account</h2></div><span className="status-dot">Active</span></div><dl className="account-list"><div><dt>Name</dt><dd>{user.name || "Not provided"}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Roles</dt><dd>{user.roles.join(", ") || "user"}</dd></div><div><dt>Permissions</dt><dd>{user.permissions.join(" · ") || "None"}</dd></div></dl></section>}
        {view === "access" && canManageRoles && <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Administration</p><h2>Role assignments</h2></div><span className="status-dot">roles:manage</span></div><p className="manager-note">Roles are additive. Changes are validated and enforced by the backend immediately after saving.</p>{error && <p className="error" role="alert">{error}</p>}<div className="access-list">{managedUsers.map((member) => { const assigned = draftRoles[member.id] ?? []; return <div className="access-row" key={member.id}><div><strong>{member.name || "Drive member"}</strong><small>{member.email}</small></div><fieldset><legend className="sr-only">Roles for {member.email}</legend>{roles.map((role) => <label className="role-check" key={role.key}><input type="checkbox" checked={assigned.includes(role.key)} onChange={(event) => setDraftRoles((drafts) => ({ ...drafts, [member.id]: event.currentTarget.checked ? [...assigned, role.key] : assigned.filter((key) => key !== role.key) }))} />{role.name}</label>)}</fieldset><PButton variant="secondary" disabled={saving === member.id} onClick={() => void saveRoles(member)}>{saving === member.id ? "Saving…" : "Save roles"}</PButton></div>; })}</div></section>}
      </div>
    </section>
  </main>;
}
