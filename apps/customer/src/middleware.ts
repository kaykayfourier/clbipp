import { createAuthMiddleware } from '@clbipp/auth/middleware'

// Must live at src/middleware.ts (not the app root) — Next's dev bundler
// silently ignores root-level middleware when src/app is in use.
export const middleware = createAuthMiddleware({
  publicPaths: ['/login', '/signup', '/auth', '/t', '/verify'],
  homePath: '/dashboard',
  // allowRoles: ['customer'] — enabled once profiles.role exists (Batch 6).
})

export const config = {
  matcher: [
    // Run on everything except static assets and PWA files (which must load
    // logged-out for install/offline to work).
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)',
  ],
}
