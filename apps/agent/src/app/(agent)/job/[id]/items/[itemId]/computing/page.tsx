// …/computing  —  Batch 5a · Ali
//
// Shows while the engine prices one lithium item. The work happens in the
// computeItemQuote server action (../actions.ts), from the readings the damage
// screen stored on BatteryItem.quoteData.input.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { isLithium } from '@clbipp/core/intake'
import { AppShell, PagePadding } from '@clbipp/ui'

import { requireIntakeOpen } from '@/lib/safety-gate'
import { itemNextHref } from '@/lib/job-nav'

import { ComputingRunner } from './ComputingRunner'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 🔴 THE GATE.
  await requireIntakeOpen(id, user.id)

  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId: id },
    select: { id: true, chemistry: true, quoteData: true },
  })
  if (!item) redirect(`/job/${id}/items`)
  if (!isLithium(item.chemistry)) redirect(itemNextHref(id, item.id, item.chemistry))

  // No readings saved yet → the agent hasn't been through the rubric for this
  // item. Send them there rather than run the engine on nothing.
  const quoteData = item.quoteData as { input?: unknown } | null
  if (!quoteData?.input) redirect(`/job/${id}/items/${itemId}/damage`)

  return (
    <AppShell title="Calculating price" hideNav>
      <PagePadding>
        <ComputingRunner pickupId={id} itemId={item.id} />
      </PagePadding>
    </AppShell>
  )
}
