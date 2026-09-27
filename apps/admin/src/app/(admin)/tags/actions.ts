'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { MAX_TAGS_PER_ISSUE, issueBatchNumber, mintCode } from '@clbipp/core/tags'

import { requireAdmin } from '@/lib/admin-identity'

// ─── Issuing battery tags (FV10 · FD12) ──────────────────────────────────────
// The office mints a sheet of codes and prints it BEFORE a run; agents carry
// the sheet and bind one tag to each battery line at collection. That is what
// dissolved FD11's "no printer in the van" objection: the van needs a sheet,
// not a printer.
//
// A minted tag is inert until bound — issuing one asserts nothing about any
// battery. So this writes only `item_tags` rows plus one audit row for the
// batch, and there is no lifecycle anywhere near it.

const AUDIT_ACTION: AdminAuditAction = 'tag.issue'
const AUDIT_SUBJECT: AdminAuditSubject = 'item_tag'

/** A random code collides with an existing one once in ~a billion; five rounds
 *  of top-ups is belt and braces, not an expected path. */
const MAX_MINT_ROUNDS = 5

export type IssueResult = { error: string | null; issueBatch: string | null }

export async function issueTags(count: number): Promise<IssueResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, issueBatch: null }
  const admin = gate.admin

  if (!Number.isInteger(count) || count < 1 || count > MAX_TAGS_PER_ISSUE) {
    return { error: `Issue between 1 and ${MAX_TAGS_PER_ISSUE} tags at a time.`, issueBatch: null }
  }

  const issueBatch = issueBatchNumber(new Date())

  // `createMany` with `skipDuplicates` inserts what it can; a collision (on the
  // code's unique index) is simply skipped and topped up on the next round.
  let created = 0
  for (let round = 0; round < MAX_MINT_ROUNDS && created < count; round += 1) {
    const need = count - created
    const codes = new Set<string>()
    while (codes.size < need) codes.add(mintCode('tag'))
    const result = await prisma.itemTag.createMany({
      data: [...codes].map((code) => ({ code, issueBatch, issuedBy: admin.id })),
      skipDuplicates: true,
    })
    created += result.count
  }

  if (created === 0) return { error: 'Could not mint any tags. Try again.', issueBatch: null }

  await prisma.adminAudit.create({
    data: {
      actorId: admin.id,
      action: AUDIT_ACTION,
      subjectType: AUDIT_SUBJECT,
      subjectId: issueBatch,
      after: { issueBatch, count: created },
    },
  })

  return { error: null, issueBatch }
}

export async function issueTagsAction(formData: FormData) {
  const count = Number(String(formData.get('count') ?? '').trim())
  const { error, issueBatch } = await issueTags(count)
  if (error || !issueBatch) redirect(`/tags?error=${encodeURIComponent(error ?? 'Could not issue tags.')}`)

  revalidatePath('/tags')
  redirect(`/tags?issued=${encodeURIComponent(issueBatch)}`)
}
