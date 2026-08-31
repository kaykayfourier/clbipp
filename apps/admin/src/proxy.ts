import { createAuthMiddleware } from '@clbipp/auth/middleware'

// 🔴 Must live at src/proxy.ts, NOT the project root — Next's dev bundler
// silently never registers a root-level proxy/middleware file when src/app is
// in use, and an unregistered auth guard fails OPEN. Verify after every build:
// `npm run build` must print `ƒ Proxy (Middleware)` for this app.
//
// @clbipp/auth/src/middleware.ts is the factory and is deliberately NOT renamed
// — it's an ordinary module, not a convention file.
//
// ⚠ This file matters more here than in either other app. Under AD3 the admin
// console has NO RLS policies: it reads and writes through Prisma and the
// service role, which bypasses row-level security entirely. So this guard plus
// the in-code role re-checks inside each server action are the WHOLE access
// boundary. A fail-open proxy here does not leak one vendor's rows to another —
// it hands every pickup, every price and every engine parameter in the system
// to whoever is logged in.
export const proxy = createAuthMiddleware({
  // /auth is here for parity with the customer app's callback route. The admin
  // app has no OAuth today; leaving the path public costs nothing and stops a
  // future callback from being bounced by the guard it needs to run before.
  publicPaths: ['/login', '/auth'],

  // The dashboard. Also where the factory sends an authenticated session that
  // lands on /login, so this must always be a real page.
  homePath: '/',

  // One admin role (AD2). `ops` appears throughout the wireframe (W10) and is
  // NOT a UserRole value — UserRole is customer | agent | admin — so it is
  // deliberately absent here rather than added to the enum.
  //
  // This is the third leg of a three-way gate: customer app allows ['customer'],
  // agent app allows ['agent'], and this allows ['admin']. All six directions
  // are asserted in scripts/smoke.mjs, because a gate only ever tested in one
  // direction is indistinguishable from a gate that blocks everyone.
  //
  // Backed by supabase/grants.sql: `authenticated` has no write privilege on
  // profiles.role, so a vendor cannot promote themselves past this check.
  allowRoles: ['admin'],

  // No onboardingPath, deliberately — same reasoning as the agent app's D6, and
  // stronger here. Admins do not self-sign-up; accounts come from the seed. A
  // session with no profiles row is not a half-finished signup to rescue, it is
  // an account that cannot use this app, and the factory signs it out. Adding
  // an onboarding path would create a self-service route into the console that
  // sees every price in the business.
  onboardingPath: undefined,
})

export const config = {
  matcher: [
    // Run on everything except static assets.
    //
    // ⚠ Trap 2, and the reason this list is spelled out rather than left as a
    // directory glob: anything added to apps/admin/public/ must ALSO be named
    // here, by filename, or the guard 307s it to /login. That silently made the
    // customer app un-installable for weeks because its matcher excluded an
    // `icons/` directory that never existed while the real icons sat at the
    // root.
    //
    // The admin app is still NOT a PWA (AD11, R5) — no manifest, no service
    // worker, no install prompt, and deliberately no 192/512 PNGs, because it
    // is a desktop console in a browser-sized window and has nothing to install
    // to a home screen. `icon.svg` is a browser TAB icon only.
    //
    // 🔴 It is named here for exactly the reason above: without it the guard
    // 307s /icon.svg to /login, the browser gets an HTML redirect where it
    // asked for an image, and the tab silently falls back to a blank page
    // glyph. That is the customer-app trap reproduced — it looks like the icon
    // "just didn't work" rather than like an auth guard eating it.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
}
