import 'server-only'

import { createClient } from '@clbipp/auth/server'
import { prisma } from '@clbipp/database'

// ─── Who is writing? ─────────────────────────────────────────────────────────
// The admin app's answer to `apps/agent/src/lib/safety-gate.ts`: one server-side
// helper that every lifecycle-writing action in this app calls first.
//
// 🔴 AD3 — this app has NO RLS policies. Prisma connects as the table owner and
// never consults them, and there is no admin policy on `pickups` to fall back
// on. So `src/proxy.ts` plus THIS function are the entire access boundary on a
// write. The proxy is what stops a vendor session reaching the route at all;
// this is what stops a request that somehow got past it from mutating anything.
// Both have to be right — one of them being right is not enough (trap 1: an
// unregistered proxy fails OPEN, and if that happens this is all that is left).
//
// Three rules, copied from the agent app's reference action
// (apps/agent/src/app/(agent)/job/[id]/actions.ts):
//   1. Identity comes from the SESSION, never from a form field. A form field
//      is attacker-controlled, so checking it against itself proves nothing.
//   2. The role is re-read from the database on every call, not trusted from a
//      cookie or a client prop.
//   3. The caller gets a boring string back, not a thrown 500 — an action that
//      throws inside a POST loses the form.

export type AdminIdentity = { id: string; name: string; email: string }

export type RequireAdminResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; error: string }

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return { ok: false, error: 'Not authenticated.' }

  // Read through Prisma rather than the session client: `profiles` has a
  // "see only your own row" policy, so a server-client read works too — but
  // every other read in this action file is Prisma, and mixing the two here
  // means the role check and the write could disagree about which database
  // connection they are on.
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, fullName: true, email: true },
  })

  if (!profile) return { ok: false, error: 'No profile for this session.' }

  // AD2 — one admin role. `ops` is not a UserRole value and is not being added,
  // so this is a plain equality check and not a permission matrix.
  if (profile.role !== 'admin') {
    return { ok: false, error: 'That account cannot perform admin actions.' }
  }

  return {
    ok: true,
    admin: {
      id: profile.id,
      name: profile.fullName || profile.email || 'Admin',
      email: profile.email,
    },
  }
}
