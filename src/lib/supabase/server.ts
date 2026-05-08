/**
 * Supabase server-side client.
 *
 * Two flavors:
 *   - publicClient(): uses the anon/publishable key. Read-only thanks to RLS.
 *     Use this for any server component that just queries fci_* data.
 *   - adminClient():  uses SUPABASE_SERVICE_ROLE_KEY. Bypasses RLS.
 *     Use ONLY in protected route handlers (cron, admin endpoints).
 *
 * Validation is intentionally lazy (inside each function, not at module load)
 * so that simply importing this file does NOT crash the build. Vercel
 * "collects page data" by evaluating route modules at build time; if env
 * vars are missing then we'd fail the deploy even when the route is fine.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env vars",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL — cannot create admin client",
    );
  }
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — admin operations cannot run",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
