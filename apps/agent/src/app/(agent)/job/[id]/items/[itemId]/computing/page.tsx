// …/computing  —  Batch 5a · Ali
//
// Six-layer stepper. Honest — it visually reflects the real engine
// (packages/decision-engine, Layers 0–5), and the POST it fires is the real
// call, not a simulated delay dressed up as one.
//
// Reads the QuoteInput draft the damage rubric wrote onto
// BatteryItem.quoteData.input (the workaround column — see schema.prisma) and
// hands it to a client runner, because the actual POST /api/quote call has to
// happen in the browser: it's the same route Batch 4 built and already
// depends on the caller's session cookie for auth.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { isLithium } from '@clbipp/core/intake'
import { AppShell, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
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
  await requireSafetyChecklist(id, user.id)

  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId: id },
    select: { id: true, chemistry: true, quoteData: true },
  })
  if (!item) redirect(`/job/${id}/items`)
  if (!isLithium(item.chemistry)) redirect(itemNextHref(id, item.id, item.chemistry))

  const quoteData = item.quoteData as { input?: Record<string, unknown> } | null
  const input = quoteData?.input as
    | {
        battery: Record<string, unknown>
        damage: Record<string, unknown>
        distance_km: { in: number }
        inflow_type: string
      }
    | undefined

  // No draft saved yet → the agent hasn't been through the rubric for this
  // item. Send them there rather than render a runner with nothing to run.
  if (!input) redirect(`/job/${id}/items/${itemId}/damage`)

  return (
    <AppShell title="Computing" hideNav>
      <PagePadding>
        <ComputingRunner pickupId={id} itemId={item.id} batteryType={item.chemistry!} quoteInput={input} />
      </PagePadding>
    </AppShell>
  )
}
