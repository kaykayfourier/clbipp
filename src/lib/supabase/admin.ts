import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ─── Service-role Supabase client ─────────────────────────────────────────────
// SERVER-ONLY. Uses the service-role key, which BYPASSES RLS entirely — so it
// must never be imported into a client component (the `server-only` import above
// makes any such import a build error).
//
// Used for privileged pickup lifecycle transitions (accept → collected,
// cancel → cancelled) that vendor sessions are deliberately NOT allowed to do
// directly: there is no vendor UPDATE policy on `pickups`, and only the service
// role may write `status_events`. Because RLS is bypassed, every caller here
// MUST re-check ownership itself before mutating.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    // No cookie/session handling — this client is not tied to a browser session.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
