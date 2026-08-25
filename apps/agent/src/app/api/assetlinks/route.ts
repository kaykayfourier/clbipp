// Digital Asset Links — served at /.well-known/assetlinks.json via a rewrite in
// next.config.ts (Next ignores dot-directories under app/, so it cannot be a
// route folder).
//
// ─── What this is for ───────────────────────────────────────────────────────
// A Trusted Web Activity (TWA) is this web app wrapped as a real Android app
// for the Play Store. Android only drops the browser UI — the address bar, the
// "running in Chrome" chrome — if it can prove the app and the website belong
// to the same owner. That proof is this file: the site names the Android
// package and the SHA-256 fingerprint of the certificate that signed it.
//
// 🔴 Get this wrong and it does NOT fail loudly. The app still installs and
// still runs; it just shows a browser address bar at the top forever, which is
// the one thing that makes a TWA look like a website in a costume.
//
// ─── Why an env var and not a static file ───────────────────────────────────
// The fingerprint is not known when this code is written, and it CHANGES:
//   1. Bubblewrap generates a local signing key → one fingerprint, for testing.
//   2. On upload, Play App Signing has Google re-sign the app with THEIR key →
//      a different fingerprint, which only exists after the first Play Console
//      upload.
// Both must be listed during the transition, and the second cannot be known in
// advance by anyone. Baking a fingerprint into a committed file would mean a
// code change and a redeploy at exactly the point someone else owns the
// process. Set the env var instead — see docs/NATIVE_APP_HANDOVER.md.
//
// Returns an empty array (valid JSON, zero relations) when unset, which is the
// correct "no Android app is associated with this domain yet" answer.

export const dynamic = 'force-dynamic'

interface AssetLinkStatement {
  relation: string[]
  target: {
    namespace: string
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

export function GET(): Response {
  const packageName = process.env.ANDROID_PACKAGE_NAME
  // Comma-separated. Google's own tooling prints them colon-delimited and
  // upper-case (AA:BB:CC:…), which is the format this file wants — so paste
  // them through unchanged and just separate multiple keys with a comma.
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

  const statements: AssetLinkStatement[] =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : []

  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      // Android's verifier is content-type sensitive.
      'Content-Type': 'application/json',
      // Verification happens at install time and on updates. A short cache
      // keeps a stale fingerprint from outliving a signing-key change by long.
      'Cache-Control': 'public, max-age=300',
    },
  })
}
