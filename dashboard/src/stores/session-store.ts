"use client";

import { create } from "zustand";
import type { Session } from "@/lib/api";

type SessionState = {
  accessToken: string | null;
  user: Session["user"] | null;
  setSession: (session: Session) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (session) => set({ accessToken: session.accessToken, user: session.user }),
  clear: () => set({ accessToken: null, user: null }),
}));
