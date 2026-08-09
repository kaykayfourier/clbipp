import { createAuthMiddleware } from '@clbipp/auth/middleware'

// Must live at src/middleware.ts (not the app root) — Next's dev bundler
// silently ignores root-level middleware when src/app is in use.
export const middleware = createAuthMiddleware({
  publicPaths: ['/login', '/signup', '/auth', '/t', '/verify'],
  homePath: '/dashboard',
  // Enabled in Batch 6. An agent or admin session reaching the customer app is
  // signed out rather than shown a customer's screens — the same factory call
  // is what will gate apps/agent and apps/admin on their own roles.
  // Backed by supabase/grants.sql: `authenticated` has no write privilege on
  // profiles.role, so a customer cannot promote themselves past this check.
  allowRoles: ['customer'],
})

export const config = {
  matcher: [
    // Run on everything except static assets and PWA files (which must load
    // logged-out for install/offline to work).
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)',
  ],
}
