// ─────────────────────────────────────────────────────────────────────────────
// Auth store (Zustand) wrapping Supabase auth.
//
// Works in GUEST mode when `supabase === null`: every action becomes a no-op /
// returns a friendly error, and `user` stays null so the UI shows "sign in".
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase, isConfigured } from "../lib/supabase";

/** Minimal user view the UI needs (name + email + id). */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface AuthState {
  /** Signed-in user, or null when signed out / guest mode. */
  user: AuthUser | null;
  /** True while an auth request is in flight (sign in/up/out). */
  loading: boolean;
  /** True if Supabase is configured (cloud features available). */
  configured: boolean;
  /** True once init() has run and the initial session was resolved. */
  ready: boolean;

  init: () => void;
  signUpEmail: (email: string, pw: string, name?: string) => Promise<{ error: string | null }>;
  signInEmail: (email: string, pw: string) => Promise<{ error: string | null }>;
  signInGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const GUEST_MSG = "Cloud accounts aren't configured. You can keep working locally as a guest.";

/** Map a Supabase User → our slim AuthUser. */
function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.user_name === "string" && meta.user_name) ||
    null;
  return { id: u.id, email: u.email ?? null, name };
}

let subscribed = false;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  configured: isConfigured,
  ready: !isConfigured, // nothing to wait for in guest mode

  init: () => {
    if (!supabase) {
      set({ ready: true, configured: false });
      return;
    }
    if (subscribed) return;
    subscribed = true;

    // Resolve current session first…
    supabase.auth
      .getSession()
      .then(({ data }) => set({ user: toAuthUser(data.session?.user ?? null), ready: true }))
      .catch(() => set({ ready: true }));

    // …then keep in sync with future changes.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: toAuthUser(session?.user ?? null), ready: true });
    });
  },

  signUpEmail: async (email, pw, name) => {
    if (!supabase) return { error: GUEST_MSG };
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: { data: name ? { name } : undefined },
      });
      if (error) return { error: error.message };
      // If email confirmation is OFF, session is live immediately.
      if (data.user && data.session) set({ user: toAuthUser(data.user) });
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },

  signInEmail: async (email, pw) => {
    if (!supabase) return { error: GUEST_MSG };
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) return { error: error.message };
      set({ user: toAuthUser(data.user) });
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },

  signInGoogle: async () => {
    if (!supabase) return { error: GUEST_MSG };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      // On success the browser redirects away; onAuthStateChange picks it up on return.
      if (error) return { error: error.message };
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    if (!supabase) {
      set({ user: null });
      return;
    }
    set({ loading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },
}));
