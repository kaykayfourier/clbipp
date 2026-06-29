import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes reachable while logged out. Everything else requires a session.
const PUBLIC_PATHS = ['/login', '/signup', '/auth']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
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

  // Authenticated users shouldn't sit on the login/signup screens.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return redirectTo(request, '/profile', supabaseResponse)
  }

  return supabaseResponse
}

// Redirect while carrying over any auth cookies the session refresh just set,
// so the redirect doesn't drop a freshly-rotated session.
function redirectTo(request: NextRequest, pathname: string, base: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const response = NextResponse.redirect(url)
  base.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}

export const config = {
  matcher: [
    // Run on everything except static assets (auth-route logic is handled above).
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
