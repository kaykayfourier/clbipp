// /job/[id]/scan  —  Batch 3 · Ali's lane
//
// DEFERRED, and deliberately (Batch 3, 2026-08-23). QR scan is step 5 of the
// batch — "last, and only if there's time" — and it is #2 on the sprint's cut
// list. Manual entry is the primary path and it is built: /job/[id]/items and
// the per-item confirm are the real intake flow. 'Generate QR' is deferred
// further still, because it implies physical labelling we cannot demo.
//
// NOTHING LINKS HERE. The route stays so it is smoke-covered and so the batch
// that builds it has a place to land, but the item list does not offer it — a
// dead button is worse than an absent one (the same call Batch 8's task list
// makes about "Cash out" and "Notifications").
//
// 🔴 THE SAFETY GATE IS ALREADY WIRED, so whoever builds this screen inherits it
// rather than having to remember it. Scanning a battery is handling a battery.
// Keep the two lines below; see apps/agent/src/lib/safety-gate.ts.
//
// `hideNav` is required — (agent)/layout.tsx owns the nav and the clearance
// under it. Add no bottom padding.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { AppShell, Banner, Button, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 🔴 THE GATE. Keep this. See the note at the top of the file.
  await requireSafetyChecklist(id, user.id)

  return (
    <AppShell title="Scan" showBack backHref={`/job/${id}/items`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <Banner variant="info">
          QR scanning is not in this build. Enter each line by hand from the item
          list — that is the primary path, not a fallback.
        </Banner>
        <Link href={`/job/${id}/items`}>
          <Button variant="primary" fullWidth>
            Back to the item list
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}
