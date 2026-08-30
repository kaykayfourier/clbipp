'use server'

// D02 · Market feed override — Batch 16 · B (Khalid)
//
// 🔴 An override INSERTS a new MarketPrices snapshot row. It never updates one
// in place. getMarketData() reads `findFirst orderBy updatedAt desc`, so a new
// row simply becomes the live one and the previous snapshot survives as
// history — which is the whole point of a feed you can audit.
//
// 🔴 PRICING SURFACE. A metal price directly moves every li-ion quote. The
// AdminAudit row plus a mandatory typed reason is what makes that traceable.
//
// Follows the reference shape from dispatch/actions.ts: requireAdmin →
// validate server-side → $transaction { insert, audit } → revalidate →
// redirect-after-POST with the error in the query string.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { requireAdmin } from '@/lib/admin-identity'

const METALS = ['Li', 'Co', 'Ni', 'Mn', 'Cu', 'Al'] as const

export async function overrideMarketPrices(formData: FormData) {
  const fail = (message: string): never =>
    redirect(`/market?error=${encodeURIComponent(message)}`)

  const auth = await requireAdmin()
  if (!auth.ok) return fail(auth.error)

  // isReasonRequired('market.override') is true — enforced here, not by the
  // column, per packages/core/src/audit.ts.
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return fail('A reason is required for a market override.')

  const prices: Record<string, number> = {}
  for (const metal of METALS) {
    const raw = Number(formData.get(metal))
    if (!Number.isFinite(raw) || raw <= 0) {
      return fail(`${metal} price must be a positive number.`)
    }
    prices[metal] = raw
  }

  const fxRate = Number(formData.get('fxRateUsdInr'))
  if (!Number.isFinite(fxRate) || fxRate <= 0) {
    return fail('FX rate must be a positive number.')
  }

  // The row the override replaces — captured for the audit's `before`.
  const previous = await prisma.marketPrices.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, Li: true, Co: true, Ni: true,
      Mn: true, Cu: true, Al: true, fxRateUsdInr: true,
    },
  })

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.marketPrices.create({
        data: {
          Li: prices.Li,
          Co: prices.Co,
          Ni: prices.Ni,
          Mn: prices.Mn,
          Cu: prices.Cu,
          Al: prices.Al,
          fxRateUsdInr: fxRate,
          source: 'manual-override',
          note,
          createdBy: auth.admin.id,
        },
      })

      await tx.adminAudit.create({
        data: {
          action: 'market.override',
          subjectType: 'market_prices',
          subjectId: created.id,
          actorId: auth.admin.id,
          reason: note,
          before: previous
            ? {
                Li: Number(previous.Li),
                Co: Number(previous.Co),
                Ni: Number(previous.Ni),
                Mn: Number(previous.Mn),
                Cu: Number(previous.Cu),
                Al: Number(previous.Al),
                fxRateUsdInr: Number(previous.fxRateUsdInr),
              }
            : undefined,
          after: { ...prices, fxRateUsdInr: fxRate },
        },
      })
    })
  } catch (error) {
    console.error('[overrideMarketPrices] failed:', error)
    return fail('Could not save the override. Nothing was changed.')
  }

  revalidatePath('/market')
  redirect('/market?saved=1')
}