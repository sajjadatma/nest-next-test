"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PButton, PWordmark } from "@porsche-design-system/components-react/ssr";
import { api, clear, save, Session } from "@/lib/api";
import { Toast } from "@/components/toast";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const register = mode === "register";
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!register);

  useEffect(() => {
    if (register) return;
    let mounted = true;
    api("/auth/me")
      .then(() => router.replace("/dashboard"))
      .catch(() => clear())
      .finally(() => { if (mounted) setCheckingSession(false); });
    return () => { mounted = false; };
  }, [register, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const session = await api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ name: form.get("name") || undefined, email: form.get("email"), password: form.get("password") }) });
      save(session);
      router.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (checkingSession) return <main className="loading"><span className="eyebrow">Checking your session…</span></main>;

  return <main className="auth">{error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}<section className="visual"><div><PWordmark /><p className="eyebrow">Drive / Digital account</p></div><div><h1>Made for the next move.</h1><p>A considered account experience designed with the Porsche Design System and powered by NestJS.</p></div><p className="eyebrow">Precision in every interaction</p></section><section className="panel"><div className="card"><PWordmark /><p className="eyebrow">{register ? "Create your account" : "Welcome back"}</p><h2>{register ? "Start your journey." : "Sign in to Drive."}</h2><p>{register ? "Set up your account to see your dashboard." : "Use your account details to continue."}</p><form className="form" onSubmit={submit}>{register && <label className="field">Full name<input name="name" autoComplete="name" placeholder="Jane Smith" /></label>}<label className="field">Email address<input name="email" type="email" required autoComplete="email" placeholder="jane@example.com" /></label><label className="field">Password<input name="password" type="password" required minLength={8} autoComplete={register ? "new-password" : "current-password"} placeholder="Minimum 8 characters" /></label><PButton type="submit" disabled={pending}>{pending ? "Please wait…" : register ? "Create account" : "Sign in"}</PButton></form><p className="footer">{register ? "Already have an account?" : "New to Drive?"} <Link href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p></div></section></main>;
}
