'use server'

import { redirect } from 'next/navigation'
import { signOut } from '@clbipp/auth'

export async function logout() {
  await signOut()
  redirect('/login')
}
