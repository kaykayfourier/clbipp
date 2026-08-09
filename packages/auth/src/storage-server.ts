import 'server-only'
import { createAdminClient } from './supabase/admin'
import type { Bucket } from './storage'

// ─── Supabase Storage — server-side read helpers ─────────────────────────────
// SERVER-ONLY, and split out of ./storage on purpose: that file is imported by
// client components, and a "server-only" import anywhere in its module graph
// would turn the whole booking wizard into a build error.
//
// All five buckets are PRIVATE, so there is no public URL to link to — a
// stored path only becomes viewable through a short-lived signed URL minted
// here with the service-role key. Three of the buckets (certificates, receipts,
// invoices) have no SELECT policy for `authenticated` at all, which makes this
// the *only* read path for them.
//
// Because the service role bypasses RLS, callers MUST check ownership before
// asking for a URL — signing a path is granting access to it.

/** 1 hour. Long enough to open a PDF or scroll a photo grid, short enough that a leaked URL expires. */
const DEFAULT_EXPIRY_SECONDS = 60 * 60

export async function createSignedUrl(
  bucket: Bucket,
  path: string,
  expiresIn: number = DEFAULT_EXPIRY_SECONDS,
): Promise<{ url: string | null; error: string | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn)

  if (error || !data) {
    console.error('[createSignedUrl] failed:', error)
    return { url: null, error: error?.message ?? 'Could not create a signed URL.' }
  }

  return { url: data.signedUrl, error: null }
}

/**
 * Batch version — one round trip for a grid of photos.
 * Returns only the paths that signed successfully; a missing object shouldn't
 * blank out the whole gallery.
 */
export async function createSignedUrls(
  bucket: Bucket,
  paths: string[],
  expiresIn: number = DEFAULT_EXPIRY_SECONDS,
): Promise<{ urls: { path: string; url: string }[]; error: string | null }> {
  if (paths.length === 0) return { urls: [], error: null }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, expiresIn)

  if (error || !data) {
    console.error('[createSignedUrls] failed:', error)
    return { urls: [], error: error?.message ?? 'Could not create signed URLs.' }
  }

  return {
    urls: data.flatMap((d) =>
      d.signedUrl && d.path ? [{ path: d.path, url: d.signedUrl }] : [],
    ),
    error: null,
  }
}
