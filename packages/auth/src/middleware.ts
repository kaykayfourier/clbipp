import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ─── Shared auth middleware factory ──────────────────────────────────────────
// Each app's src/middleware.ts is a five-line caller of this factory — that is
// what makes auth "free" for the Agent and Admin apps. The middleware file
// itself MUST stay at apps/<app>/src/middleware.ts: Next's dev bundler silently
// never registers middleware at the project root when src/app is in use.

export type AuthMiddlewareOptions = {
  /** Routes reachable while logged out (matched exact or as a path prefix). */
  publicPaths: string[]
  /** Where authenticated users land (and are bounced to from /login, /signup). */
  homePath: string
  /**
   * If set, the session's profile.role must be one of these to use this app;
   * other roles are signed out to /login. Omit to skip the role check (the
   * customer app omits it until roles ship).
   */
  allowRoles?: string[]
  /**
   * Where a signed-in user with NO profiles row goes to finish account setup
   * (Batch 11). Set this and a profile-less session is redirected there instead
   * of being signed out — which is what OAuth needs, because Google creates an
   * auth.users row and no profile.
   *
   * The path requires a session but is exempt from the role gate: gating it
   * would bounce the very session it exists to serve. It is deliberately NOT a
   * public path, so a logged-out visitor still goes to /login.
   *
   * Omit it (agent/admin apps today) and the old behaviour is unchanged: a
   * profile-less session is signed out, because those apps have no way to
   * complete an account.
   */
  onboardingPath?: string
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { publicPaths, homePath, allowRoles, onboardingPath } = options

  const isPublicPath = (pathname: string) =>
    publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            )
          },
        },
      },
    )

    // Refreshes the session if expired and tells us who (if anyone) is logged in.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { pathname } = request.nextUrl

    // Unauthenticated users may only see public routes.
    if (!user && !isPublicPath(pathname)) {
      return redirectTo(request, '/login', supabaseResponse)
    }

    if (user) {
      const onOnboarding =
        onboardingPath !== undefined &&
        (pathname === onboardingPath || pathname.startsWith(`${onboardingPath}/`))

      // Role gate: a session whose profile role isn't allowed in this app is
      // signed out and sent to login (e.g. an agent opening the customer app).
      // The same read answers the Batch 11 question — does this session have a
      // profile row at all — so onboarding costs no extra query.
      if ((allowRoles || onboardingPath) && !isPublicPath(pathname)) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        // Distinguish "not allowed" from "couldn't tell". A dropped connection
        // or a Supabase blip returns an error here, and signing the user out for
        // it would log out the whole app on a transient failure — and, because
        // signOut clears the refresh token, they could not simply retry. Fail
        // open on an infrastructure error; fail closed on a real answer.
        //
        // PGRST116 is "no rows": a genuine answer, meaning an auth user with no
        // profile row.
        const noProfileRow = error?.code === 'PGRST116'
        if (error && !noProfileRow) {
          return supabaseResponse
        }

        if (noProfileRow || !profile) {
          // A half-created account: an auth user with no profile. Every
          // RLS-scoped screen would render empty, so it cannot be let through.
          //
          // Whether that is recoverable depends on the app. With an onboarding
          // path it is — this is the normal state right after an OAuth sign-in,
          // which creates an auth.users row and nothing else — so send them
          // there. Without one, the old behaviour stands.
          //
          // Handling it HERE rather than only in /auth/callback is deliberate:
          // the callback is one way in, but a refresh, a bookmark or a
          // history entry all arrive with the same profile-less cookie and
          // never pass through it. Fixing only the callback would leave the
          // sign-out loop reachable by pressing reload.
          if (!onboardingPath) {
            await supabase.auth.signOut()
            return redirectTo(request, '/login', supabaseResponse, {
              error: 'That account cannot access this app.',
            })
          }
          // Already on the onboarding screen: let it render, or it can never
          // be reached by the session it exists for.
          if (onOnboarding) return supabaseResponse
          return redirectTo(request, onboardingPath, supabaseResponse)
        }

        if (allowRoles && !allowRoles.includes(profile.role)) {
          await supabase.auth.signOut()
          return redirectTo(request, '/login', supabaseResponse, {
            error: 'That account cannot access this app.',
          })
        }

        // Onboarding is finished — the row exists. Keep them off the form so a
        // second insert can't be posted over a profile that is already there.
        if (onOnboarding) {
          return redirectTo(request, homePath, supabaseResponse)
        }
      }

      // Authenticated users shouldn't sit on the login/signup screens.
      if (pathname === '/login' || pathname === '/signup') {
        return redirectTo(request, homePath, supabaseResponse)
      }
    }

    return supabaseResponse
  }
}

// Redirect while carrying over any auth cookies the session refresh just set,
// so the redirect doesn't drop a freshly-rotated session.
function redirectTo(
  request: NextRequest,
  pathname: string,
  base: NextResponse,
  query?: Record<string, string>,
) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  }
  const response = NextResponse.redirect(url)
  base.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}
