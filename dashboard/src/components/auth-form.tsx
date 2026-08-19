"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { PButton } from "@porsche-design-system/components-react/ssr";
import { api, clear, restoreSession, save, Session, token } from "@/lib/api";
import { Toast } from "@/components/toast";
import { LanguageSwitcher } from "@/components/language-switcher";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const register = mode === "register";
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(!register);
  const { register: field, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string; email: string; password: string }>({ defaultValues: { name: "", email: "", password: "" } });

  function redirectTarget() {
    const requested = new URLSearchParams(window.location.search).get("redirect");
    return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  }

  useEffect(() => {
    if (register) return;
    let mounted = true;
    void (async () => {
      try {
        if (token() || await restoreSession()) await api("/auth/me");
        else clear();
        if (mounted && token()) router.replace(redirectTarget());
      } catch {
        clear();
      } finally {
        if (mounted) setCheckingSession(false);
      }
    })();
    return () => { mounted = false; };
  }, [register, router]);

  async function submit(values: { name: string; email: string; password: string }) {
    setError("");
    try {
      const session = await api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ name: values.name || undefined, email: values.email, password: values.password }) });
      save(session);
      router.replace(redirectTarget());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    }
  }

  if (checkingSession) return <main className="loading"><span className="eyebrow">Checking your session…</span></main>;

  return <main className="auth">{error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}<section className="visual"><div><span className="auth-brand">NEST<span aria-hidden="true">™</span></span><p className="eyebrow">NEST / Customer account</p></div><div><h1>Make room for better everyday.</h1><p>A considered account experience for keeping your NEST orders, details, and delivery updates together.</p></div><p className="eyebrow">Thoughtful in every interaction</p></section><section className="panel"><div className="card"><div className="auth-card-head"><span className="auth-brand">NEST<span aria-hidden="true">™</span></span><LanguageSwitcher compact /></div><p className="eyebrow">{register ? "Create your account" : "Welcome back"}</p><h2>{register ? "Keep good things close." : "Welcome back to NEST."}</h2><p>{register ? "Create an account to keep your orders and delivery details in one place." : "Use your account details to continue to your orders."}</p><form className="form" onSubmit={handleSubmit(submit)}>{register && <label className="field">Full name<input autoComplete="name" placeholder="Jane Smith" {...field("name")} /></label>}<label className="field">Email address<input type="email" autoComplete="email" placeholder="jane@example.com" {...field("email", { required: "Email is required" })} />{errors.email && <small className="form-error">{errors.email.message}</small>}</label><label className="field">Password<input type="password" autoComplete={register ? "new-password" : "current-password"} placeholder="Minimum 8 characters" {...field("password", { required: "Password is required", minLength: { value: 8, message: "Use at least 8 characters" } })} />{errors.password && <small className="form-error">{errors.password.message}</small>}</label><PButton type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : register ? "Create account" : "Sign in"}</PButton></form><p className="footer">{register ? "Already have an account?" : "New to NEST?"} <Link href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p></div></section></main>;
}
