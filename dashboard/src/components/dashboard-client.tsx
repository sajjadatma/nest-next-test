"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PButton, PWordmark } from "@porsche-design-system/components-react/ssr";
import { api, clear, Overview, token } from "@/lib/api";

type View = "overview" | "account" | "access";
type CurrentUser = { id: string; email: string; name?: string | null; roles: string[]; permissions: string[] };
type Role = { key: string; name: string };
type Permission = { key: string; name: string; description?: string | null };
type ManagedUser = { id: string; email: string; name: string | null; roles: { role: Role }[]; permissions: { permission: Permission }[] };

export function DashboardClient() {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [roles, setRoles] = useState<Role[]>([]); const [permissions, setPermissions] = useState<Permission[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({}); const [draftPermissions, setDraftPermissions] = useState<Record<string, string[]>>({});
  const [profileName, setProfileName] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canManageRoles = (user?.permissions ?? []).includes("roles:manage");

  useEffect(() => {
    if (!token()) { router.replace("/login"); return; }
    api<CurrentUser>("/auth/me").then(async (account) => {
      const normalized = { ...account, roles: account.roles ?? [], permissions: account.permissions ?? [] };
      setUser(normalized); setProfileName(normalized.name ?? "");
      const [overview, roleCatalogue, permissionCatalogue, users] = await Promise.all([
        api<Overview>("/dashboard"),
        normalized.permissions.includes("roles:manage") ? api<Role[]>("/admin/roles") : Promise.resolve([]),
        normalized.permissions.includes("roles:manage") ? api<Permission[]>("/admin/permissions") : Promise.resolve([]),
        normalized.permissions.includes("roles:manage") ? api<ManagedUser[]>("/admin/users") : Promise.resolve([]),
      ]);
      setData(overview); setRoles(roleCatalogue); setPermissions(permissionCatalogue); setManagedUsers(users);
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
  async function saveAccess(member: ManagedUser) {
    const roleKeys = draftRoles[member.id] ?? []; const permissionKeys = draftPermissions[member.id] ?? [];
    if (!roleKeys.length) { setError("Every account must retain at least one role."); return; }
    setSaving(member.id); setError("");
    try { await Promise.all([api(`/admin/users/${member.id}/roles`, { method: "PUT", body: JSON.stringify({ roleKeys }) }), api(`/admin/users/${member.id}/permissions`, { method: "PUT", body: JSON.stringify({ permissionKeys }) })]); setMessage(`Access updated for ${member.email}.`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update access."); } finally { setSaving(null); }
  }

  if (!user || !data) return <main className="loading"><span className="eyebrow">Loading workspace…</span></main>;
  const name = user.name || user.email.split("@")[0];
  const navigation: { id: View; label: string; icon: string; hidden?: boolean }[] = [{ id: "overview", label: "Overview", icon: "◫" }, { id: "account", label: "My account", icon: "◎" }, { id: "access", label: "Access control", icon: "◇", hidden: !canManageRoles }];
  const toggle = (values: string[], key: string, checked: boolean) => checked ? [...values, key] : values.filter((value) => value !== key);

  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><PWordmark /><span>Drive</span></div><nav className="side-nav" aria-label="Workspace navigation">{navigation.filter(({ hidden }) => !hidden).map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}</button>)}</nav><div className="sidebar-bottom"><span className="eyebrow">Signed in as</span><strong>{name}</strong><small>{user.email}</small><PButton variant="secondary" onClick={() => { clear(); router.replace("/login"); }}>Sign out</PButton></div></aside><section className="workspace"><header className="workspace-header"><div><p className="eyebrow">Drive workspace</p><h1>{view === "overview" ? "Overview" : view === "account" ? "My account" : "Access control"}</h1></div><div className="header-profile"><span className="header-avatar">{name[0].toUpperCase()}</span><span>{name}</span></div></header><div className="workspace-content">{message && <p className="notice success" role="status">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}
    {view === "overview" && <><section className="welcome-panel"><div><p className="eyebrow">Good to see you</p><h2>Everything is ready<br />for the next move.</h2></div><p>Your workspace is protected by database-backed roles and permissions.</p></section><section className="metric-grid">{data.metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Directory</p><h2>Recently joined</h2></div><span className="status-dot">System operational</span></div>{data.recentUsers.map((recent) => <div className="member-row" key={recent.id}><span className="avatar">{(recent.name || recent.email)[0].toUpperCase()}</span><span><strong>{recent.name || "Drive member"}</strong><small>{recent.email}</small></span><time>{new Date(recent.createdAt).toLocaleDateString()}</time></div>)}</section></>}
    {view === "account" && <div className="profile-grid"><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Profile details</h2></div></div><form className="settings-form" onSubmit={updateProfile}><label>Full name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={80} /></label><label>Email address<input value={user.email} disabled /></label><div className="access-summary"><span>Roles</span><strong>{user.roles.join(", ") || "user"}</strong><span>Effective permissions</span><strong>{user.permissions.join(" · ") || "None"}</strong></div><PButton type="submit" disabled={saving === "profile"}>{saving === "profile" ? "Saving…" : "Save profile"}</PButton></form></section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Security</p><h2>Change password</h2></div></div><form className="settings-form" onSubmit={updatePassword}><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={8} required /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><p className="manager-note">Use a unique password with at least 8 characters.</p><PButton type="submit" disabled={saving === "password"}>{saving === "password" ? "Updating…" : "Update password"}</PButton></form></section></div>}
    {view === "access" && canManageRoles && <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Administration</p><h2>Roles and direct permissions</h2></div><span className="status-dot">roles:manage</span></div><p className="manager-note">Role permissions are inherited; direct permissions are additional, user-specific grants.</p><div className="access-list">{managedUsers.map((member) => { const userRoles = draftRoles[member.id] ?? []; const userPermissions = draftPermissions[member.id] ?? []; return <div className="access-row" key={member.id}><div><strong>{member.name || "Drive member"}</strong><small>{member.email}</small></div><fieldset><legend>Roles</legend>{roles.map((role) => <label className="role-check" key={role.key}><input type="checkbox" checked={userRoles.includes(role.key)} onChange={(event) => { const checked = event.currentTarget.checked; setDraftRoles((drafts) => ({ ...drafts, [member.id]: toggle(userRoles, role.key, checked) })); }} />{role.name}</label>)}</fieldset><fieldset><legend>Direct permissions</legend>{permissions.map((permission) => <label className="role-check" key={permission.key}><input type="checkbox" checked={userPermissions.includes(permission.key)} onChange={(event) => { const checked = event.currentTarget.checked; setDraftPermissions((drafts) => ({ ...drafts, [member.id]: toggle(userPermissions, permission.key, checked) })); }} />{permission.name}</label>)}</fieldset><PButton variant="secondary" disabled={saving === member.id} onClick={() => void saveAccess(member)}>{saving === member.id ? "Saving…" : "Save access"}</PButton></div>; })}</div></section>}
  </div></section></main>;
}
