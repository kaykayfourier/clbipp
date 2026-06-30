'use server'

import { redirect } from 'next/navigation'
import { signOut } from '@/lib/supabase/auth'

export async function logout() {
  await signOut()
  redirect('/login')
}
