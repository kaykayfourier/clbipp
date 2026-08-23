'use server'

import { redirect } from 'next/navigation'

import { signOut } from '@clbipp/auth'

// The agent app's only non-lifecycle mutation, and the only server action Batch
// 8 adds. Everything else this batch built is a read.
//
// A POST, not a link: signing someone out on a GET means any prefetcher or
// crawler that touches the URL logs them out — the customer app's Batch 12
// lesson, learned there on an action that mutated a pickup.
export async function logout() {
  await signOut()
  redirect('/login')
}
