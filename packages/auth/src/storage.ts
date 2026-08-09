import { createClient } from './supabase/client'

// ─── Supabase Storage — browser-side upload helpers ──────────────────────────
// Repo convention: Storage calls are wrapped here rather than scattered across
// pages. This file runs in the BROWSER (the booking wizard's photo picker holds
// a File object, which never survives a trip through a server action), so it
// deliberately does NOT import "server-only" and never touches the service-role
// key. Signed-URL generation is the server half — see ./storage-server.
//
// Uploads are authorised by RLS on storage.objects, not by this code: every
// policy in supabase/storage-policies.sql checks
// `(storage.foldername(name))[1] = auth.uid()`. So the FIRST PATH SEGMENT MUST
// BE THE UPLOADER'S USER ID or the insert is rejected. buildObjectPath is the
// single place that guarantees that.

/** The five private buckets created by packages/database/prisma/create-buckets.ts. */
export const BUCKETS = [
  'pickup-photos',
  'kyc-docs',
  'certificates',
  'receipts',
  'invoices',
] as const

export type Bucket = (typeof BUCKETS)[number]

/**
 * 5 MB. Mirrors the `fileSizeLimit` set on every bucket at creation time.
 * Checked client-side too: the bucket limit is a backstop that fails after a
 * full upload has been sent, which is a poor thing to discover on mobile data.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export type UploadResult = { path: string; error: null } | { path: null; error: string }

/**
 * Strips everything that could change how a path is interpreted — separators,
 * traversal dots, control characters — so a hostile filename can't escape the
 * user's own folder. Keeps a readable name and a lowercase extension.
 */
function sanitiseFilename(filename: string): string {
  const trimmed = filename.trim().toLowerCase()

  // Split off the extension before sanitising so a dotted name (my.photo.jpg)
  // doesn't lose it.
  const lastDot = trimmed.lastIndexOf('.')
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1
  const stem = hasExt ? trimmed.slice(0, lastDot) : trimmed
  const ext = hasExt ? trimmed.slice(lastDot + 1) : ''

  const clean = (s: string) => s.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

  const safeStem = clean(stem).slice(0, 60) || 'file'
  const safeExt = clean(ext).slice(0, 10)

  return safeExt ? `${safeStem}.${safeExt}` : safeStem
}

/**
 * Builds `<userId>/<...segments>/<timestamp>-<random>-<filename>`.
 *
 * The uid prefix is what the RLS policies check. The timestamp+random prefix
 * makes the object name unique, so two photos picked from the same camera roll
 * (both `img_0001.jpg`) don't collide — we never pass `upsert: true`, because
 * an overwrite here would silently destroy another item's audit photo.
 */
export function buildObjectPath({
  userId,
  segments = [],
  filename,
}: {
  userId: string
  segments?: string[]
  filename: string
}): string {
  const safeSegments = segments
    .map((s) => sanitiseFilename(s))
    .filter((s) => s.length > 0 && s !== 'file')

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return [userId, ...safeSegments, `${unique}-${sanitiseFilename(filename)}`].join('/')
}

/**
 * Uploads one file to a private bucket under the caller's own folder.
 *
 * Errors are returned, not thrown — this is an async boundary the UI has to
 * render (per the repo's inline-error-handling convention), and one failed
 * photo shouldn't take down a whole booking.
 */
export async function uploadFile({
  bucket,
  userId,
  file,
  segments,
}: {
  bucket: Bucket
  userId: string
  file: File
  segments?: string[]
}): Promise<UploadResult> {
  if (!userId) {
    return { path: null, error: 'Not signed in.' }
  }

  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return { path: null, error: `${file.name} is ${mb} MB — the limit is 5 MB per file.` }
  }

  if (file.size === 0) {
    return { path: null, error: `${file.name} is empty.` }
  }

  const path = buildObjectPath({ userId, segments, filename: file.name })
  const supabase = createClient()

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })

  if (error) {
    console.error('[uploadFile] upload failed:', error)
    return { path: null, error: error.message }
  }

  return { path, error: null }
}

/**
 * Uploads several files and reports per-file outcomes. Partial success is a
 * real outcome, not a failure: the caller keeps the paths that landed and shows
 * the errors for the ones that didn't, so the customer only retries what broke.
 */
export async function uploadFiles({
  bucket,
  userId,
  files,
  segments,
}: {
  bucket: Bucket
  userId: string
  files: File[]
  segments?: string[]
}): Promise<{ paths: string[]; errors: string[] }> {
  const results = await Promise.all(
    files.map((file) => uploadFile({ bucket, userId, file, segments })),
  )

  return {
    paths: results.flatMap((r) => (r.path ? [r.path] : [])),
    errors: results.flatMap((r) => (r.error ? [r.error] : [])),
  }
}

/**
 * Removes an object. Only `pickup-photos` has a DELETE policy, so this is for
 * un-picking a photo before the booking is submitted; anything else 403s.
 */
export async function removeFile(bucket: Bucket, path: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    console.error('[removeFile] delete failed:', error)
    return { error: error.message }
  }

  return { error: null }
}
