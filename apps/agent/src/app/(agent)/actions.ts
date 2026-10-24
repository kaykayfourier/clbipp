'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'

// ─── markNoticeRead (AF3) ────────────────────────────────────────────────────
// "Got it" on a day-view notice. A POST, not a link, for the same reason
// markArrived is: a GET that writes gets fired by link prefetchers.
//
// Identity from the session, never the form; the update is scoped to that
// agent's own notice in the WHERE clause (agent_notices has no RLS policy and
// Prisma bypasses RLS anyway — D10). Idempotent: a second tap updates nothing.
export async function markNoticeRead(formData: FormData) {
  const noticeId = String(formData.get('noticeId') ?? '')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (noticeId) {
    await prisma.agentNotice.updateMany({
      where: { id: noticeId, agentId: user.id, readAt: null },
      data: { readAt: new Date() },
    })
  }
  revalidatePath('/')
  redirect('/')
}
