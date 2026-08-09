/**
 * Creates the five private Storage buckets (BATCH_0B_SCHEMA.md §4).
 * Idempotent — re-running skips buckets that already exist.
 *
 * Run: npm run create-buckets --workspace=@clbipp/database
 */
import { createClient } from "@supabase/supabase-js"
import { loadAppEnv } from "./env"

const BUCKETS = [
  "pickup-photos",
  "kyc-docs",
  "certificates",
  "receipts",
  "invoices",
] as const

async function main() {
  loadAppEnv()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  for (const name of BUCKETS) {
    // All private: reads go through signed URLs, so a leaked object path is
    // not a leaked object.
    const { error } = await supabase.storage.createBucket(name, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024, // 5 MB, matches the client-side check
    })
    if (error && !/already exists/i.test(error.message)) throw error
    console.log(`${error ? "exists " : "created"}  ${name}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
