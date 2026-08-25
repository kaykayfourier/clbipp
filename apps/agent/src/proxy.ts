import { createAuthMiddleware } from '@clbipp/auth/middleware'

// 🔴 Must live at src/proxy.ts, NOT the project root — Next's dev bundler
// silently never registers a root-level proxy/middleware file when src/app is
// in use, and an unregistered auth guard fails OPEN. Verify after every build:
// `npm run build` must print `ƒ Proxy (Middleware)` for this app.
//
// @clbipp/auth/src/middleware.ts is the factory and is deliberately NOT renamed
// — it's an ordinary module, not a convention file.
export const proxy = createAuthMiddleware({
  // /auth is here for parity with the customer app's callback route. The agent
  // app has no OAuth today; leaving the path public costs nothing and stops a
  // future callback from being bounced by the guard it needs to run before.
  publicPaths: ['/login', '/auth'],

  // The day view. Also where the factory sends an authenticated session that
  // lands on /login, so this must always be a real page.
  homePath: '/',

  // The mirror of the customer app's allowRoles: ['customer']. A vendor or
  // admin session reaching this app is signed out rather than shown an agent's
  // screens — which matters more here than anywhere else in the repo, because
  // every agent screen shows full revenue, cost lines, margin and the
  // P_min/P_recommended/P_max band. That is the deliberate inverse of the
  // vendor-visibility rule, and this line is what keeps the two apart.
  //
  // Backed by supabase/grants.sql: `authenticated` has no write privilege on
  // profiles.role, so a customer cannot promote themselves past this check.
  allowRoles: ['agent'],

  // No onboardingPath, deliberately (D6). Agents do not self-sign-up; accounts
  // come from the seed. A session with no profiles row is therefore not a
  // half-finished signup to rescue — it is an account that cannot use this app,
  // and the factory signs it out. Adding an onboarding path here would create
  // the self-signup route D6 rules out.
  onboardingPath: undefined,
})

export const config = {
  matcher: [
    // Run on everything except static assets and the PWA files, which must load
    // LOGGED OUT for install and offline to work.
    //
    // 🔴 The icon filenames are listed one by one, and that is not tidiness.
    // Until 2026-08-24 this pattern excluded a directory `icons/` that has
    // never existed, while the real files sit at the public root — so every
    // icon 307'd to /login. Chrome's install criteria require it to FETCH a
    // 192px and a 512px icon, so `beforeinstallprompt` never fired and the app
    // was not installable; iOS fell back to a screenshot of the page instead of
    // apple-touch-icon.png. Nothing looked broken — the manifest itself was
    // public and returned 200, so the only symptom was an install prompt that
    // never appeared. The customer app had the identical bug.
    //
    // ⚠ Add any new public-root asset here, or it will be behind the auth gate.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|\\.well-known|icons/|icon-192\\.png|icon-512\\.png|icon\\.svg|apple-touch-icon\\.png).*)',
  ],
}
