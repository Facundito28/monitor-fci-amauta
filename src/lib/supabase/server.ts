/**
 * Supabase server-side client.
 *
 * Two flavors:
 *   - publicClient(): uses the anon/publishable key. Read-only thanks to RLS.
 *     Use this for any server component that just queries fci_* data.
 *   - adminClient():  uses SUPABASE_SERVICE_ROLE_KEY. Bypasses RLS.
 *     Use ONLY in protected route handlers (cron, admin endpoints).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  // Surfaces clearly during build/start if env is missing on Vercel.
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env vars",
  );
}

export function publicClient() {
  return createClient<Database>(SUPABASE_URL!, PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function adminClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin operations cannot run",
    );
  }
  return createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
