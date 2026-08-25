import { createAuthMiddleware } from '@clbipp/auth/middleware'
// Must live at src/proxy.ts (not the app root) — Next's dev bundler silently
// ignores a root-level proxy/middleware file when src/app is in use, and an
// unregistered auth guard fails OPEN.
export const proxy = createAuthMiddleware({
  publicPaths: ['/login', '/signup', '/auth', '/t', '/verify'],
  homePath: '/dashboard',
  // Enabled in Batch 6. An agent or admin session reaching the customer app is
  // signed out rather than shown a customer's screens — the same factory call
  // is what will gate apps/agent and apps/admin on their own roles.
  // Backed by supabase/grants.sql: `authenticated` has no write privilege on
  // profiles.role, so a customer cannot promote themselves past this check.
  allowRoles: ['customer'],
  // Batch 11. Google sign-in creates an auth.users row and no profile, which
  // the role gate above would otherwise read as a half-created account and sign
  // out. /onboarding is where that session picks individual vs fleet and the
  // profile row gets written. NOT in publicPaths — it needs a session, it just
  // doesn't need a role yet.
  onboardingPath: '/onboarding',
})

export const config = {
  matcher: [
    // Run on everything except static assets and PWA files (which must load
    // logged-out for install/offline to work).
    //
    // 🔴 The icon filenames are listed individually because the `icons/` entry
    // matches a directory that has never existed — the real files are at the
    // public root, so until 2026-08-24 every one of them 307'd to /login. That
    // silently made the app un-installable (Chrome must be able to fetch the
    // 192px and 512px icons before it will offer an install) and gave iOS a
    // page screenshot instead of apple-touch-icon.png. See apps/agent/src/proxy.ts.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|\\.well-known|icons/|icon-192\\.png|icon-512\\.png|icon\\.svg|apple-touch-icon\\.png).*)',
  ],
}
