'use server'

import { redirect } from 'next/navigation'

import { signOut } from '@clbipp/auth'

// The console shell's only mutation, and the fix for W14 — the admin wireframe
// draws an avatar in the topbar and a user block in the sidebar footer, and
// neither can sign you out. Same omission the agent wireframe had.
//
// A POST, not a link: signing someone out on a GET means any prefetcher or
// crawler that touches the URL logs them out. The customer app learned that in
// its Batch 12, on an action that mutated a pickup.
export async function logout() {
  await signOut()
  redirect('/login')
}
