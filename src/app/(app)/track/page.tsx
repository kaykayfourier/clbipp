import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/auth'
import { prisma } from '@/lib/prisma'

// Track tab lands here with no pickup selected.
// Route to the user's most recent non-cancelled pickup so the tab feels useful.
// If no pickups exist, fall back to dashboard.
export default async function TrackIndexPage() {
  const result = await getCurrentProfile()
  if (!result) redirect('/login')

  const latest = await prisma.pickup.findFirst({
    where: {
      vendorId: result.user.id,
      status: { not: 'cancelled' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  redirect(latest ? `/track/${latest.id}` : '/dashboard')
}
