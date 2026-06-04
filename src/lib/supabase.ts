// ─────────────────────────────────────────────────────────────────────────────
// Supabase client (lazy, crash-proof).
//
// The whole app must run in GUEST / local-only mode when no Supabase env vars
// are present. So we NEVER throw at import time — if either env var is missing
// (or invalid) we export `supabase = null` and `isConfigured = false`, and every
// consumer must degrade gracefully.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite injects these at build time. We type `import.meta.env` locally (rather
// than relying on a global vite-env.d.ts) so this module is self-contained and
// reads env vars without `any`. Missing vars → guest mode (handled below).
interface DenahImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
const env = (import.meta as unknown as { env?: DenahImportMetaEnv }).env ?? {};

const url = env.VITE_SUPABASE_URL?.trim();
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

/** True when both env vars are present and look usable. */
export const isConfigured: boolean = Boolean(url && anonKey);

/**
 * The shared Supabase client, or `null` when unconfigured (guest mode).
 * Consumers MUST null-check before use.
 */
export const supabase: SupabaseClient | null = (() => {
  if (!isConfigured) return null;
  try {
    return createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    // Bad URL/key — fail soft into guest mode rather than crashing the app.
    console.warn("[denah] Supabase init failed, running in guest mode:", err);
    return null;
  }
})();
