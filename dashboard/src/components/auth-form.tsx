"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { PButton } from "@porsche-design-system/components-react/ssr";
import { api, clear, restoreSession, save, Session, token } from "@/lib/api";
import { Toast } from "@/components/toast";
import { LanguageSwitcher } from "@/components/language-switcher";

const customerAccountPath = "/shop/account";

export function safeRedirectTarget(requested: string | null, fallback = customerAccountPath) {
  if (!requested || !requested.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) return fallback;
  return requested;
}

function currentRedirectTarget() {
  return safeRedirectTarget(new URLSearchParams(window.location.search).get("redirect"));
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function serverRedirectTarget() {
  return customerAccountPath;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegistering = mode === "register";
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(!isRegistering);
  const redirectTarget = useSyncExternalStore(subscribeToLocation, currentRedirectTarget, serverRedirectTarget);
  const { register: field, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string; email: string; password: string }>({ defaultValues: { name: "", email: "", password: "" } });

  useEffect(() => {
    if (isRegistering) return;
    let mounted = true;
    void (async () => {
      try {
        if (token() || await restoreSession()) await api("/auth/me");
        else clear();
        if (mounted && token()) router.replace(currentRedirectTarget());
      } catch {
        clear();
      } finally {
        if (mounted) setCheckingSession(false);
      }
    })();
    return () => { mounted = false; };
  }, [isRegistering, router]);

  async function submit(values: { name: string; email: string; password: string }) {
    setError("");
    try {
      const session = await api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ name: values.name || undefined, email: values.email, password: values.password }) });
      save(session);
      router.replace(currentRedirectTarget());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    }
  }

  if (checkingSession) return <main className="loading"><span className="eyebrow">Checking your session…</span></main>;

  const otherModeHref = `${isRegistering ? "/login" : "/register"}?redirect=${encodeURIComponent(redirectTarget)}`;
  const passwordResetHref = `/password-reset/request?redirect=${encodeURIComponent(redirectTarget)}`;

  return <main className="auth">
    {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
    <section className="visual">
      <div><span className="auth-brand">NEST<span aria-hidden="true">™</span></span><p className="eyebrow">NEST / Customer account</p></div>
      <div><h1>Make room for better everyday.</h1><p>A considered account experience for keeping your NEST orders, details, and delivery updates together.</p></div>
      <p className="eyebrow">Thoughtful in every interaction</p>
    </section>
    <section className="panel">
      <div className="card">
        <div className="auth-card-head"><span className="auth-brand">NEST<span aria-hidden="true">™</span></span><LanguageSwitcher compact /></div>
        <p className="eyebrow">{isRegistering ? "Create your account" : "Welcome back"}</p>
        <h2>{isRegistering ? "Keep good things close." : "Welcome back to NEST."}</h2>
        <p>{isRegistering ? "Create an account to keep your orders and delivery details in one place." : "Use your account details to continue to your orders."}</p>
        <form className="form" onSubmit={handleSubmit(submit)} noValidate>
          {isRegistering && <label className="field">Full name<input autoComplete="name" placeholder="Jane Smith" {...field("name")} /></label>}
          <label className="field" htmlFor="auth-email">Email address
            <input id="auth-email" type="email" autoComplete="email" placeholder="jane@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "auth-email-error" : undefined} {...field("email", { required: "Email is required" })} />
            {errors.email && <small id="auth-email-error" className="form-error" role="alert">{errors.email.message}</small>}
          </label>
          <label className="field" htmlFor="auth-password">Password
            <input id="auth-password" type="password" autoComplete={isRegistering ? "new-password" : "current-password"} placeholder="Minimum 8 characters" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "auth-password-error" : undefined} {...field("password", { required: "Password is required", minLength: { value: 8, message: "Use at least 8 characters" } })} />
            {errors.password && <small id="auth-password-error" className="form-error" role="alert">{errors.password.message}</small>}
          </label>
          <PButton type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isRegistering ? "Create account" : "Sign in"}</PButton>
        </form>
        {!isRegistering && <p className="auth-helper"><Link href={passwordResetHref}>Forgot your password?</Link></p>}
        <p className="footer">{isRegistering ? "Already have an account?" : "New to NEST?"} <Link href={otherModeHref}>{isRegistering ? "Sign in" : "Create an account"}</Link></p>
      </div>
    </section>
  </main>;
}
