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
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { publicPaths, homePath, allowRoles } = options

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
      // Role gate: a session whose profile role isn't allowed in this app is
      // signed out and sent to login (e.g. an agent opening the customer app).
      if (allowRoles && !isPublicPath(pathname)) {
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
        // profile row. That account is half-created and every RLS-scoped screen
        // would render empty, so it is treated as not allowed.
        const noProfileRow = error?.code === 'PGRST116'
        if (error && !noProfileRow) {
          return supabaseResponse
        }

        if (!profile || !allowRoles.includes(profile.role)) {
          await supabase.auth.signOut()
          return redirectTo(request, '/login', supabaseResponse, {
            error: 'That account cannot access this app.',
          })
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
