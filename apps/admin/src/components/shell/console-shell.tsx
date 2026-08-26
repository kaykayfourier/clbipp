import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'

import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

// ConsoleShell — the desktop frame every authenticated admin screen renders
// inside. Rendered once, by apps/admin/src/app/(admin)/layout.tsx.
//
// 🔴 This is the admin app's answer to <AppShell>, and it is NOT AppShell.
// AppShell and PhoneFrame are the MOBILE kit's primitives and must never be
// imported here (AD11, trap 15, risk R5) — importing one out of habit is the
// named failure mode of this sprint. `npm run smoke -- --app=admin` asserts the
// console chrome renders; a grep in the done-when checks the mobile primitives
// are absent.
//
// Layout, and why it is shaped this way: the rail and the header stay put while
// only the body scrolls (the wireframe's .cbody). That needs a fixed-height
// frame — hence `h-full overflow-hidden` on <body> in the root layout — with
// `overflow-y-auto` on this one inner div. Give the document the scroll instead
// and the sidebar scrolls away with it, which on a nine-column table is
// immediately annoying.

export async function ConsoleShell({ children }: { children: React.ReactNode }) {
  // Identity comes from the SESSION, never from a prop or a URL. This read goes
  // through the server Supabase client, so RLS's "a user sees only their own
  // row" policy on profiles applies — which works unchanged for an admin
  // session and is why Batch 0 adds no policy of its own (AD3).
  const result = await getCurrentProfile()

  // Belt and braces behind src/proxy.ts. The guard should already have bounced
  // an anonymous or non-admin session before this layout ever runs, so reaching
  // here means the guard did not run — the exact fail-open state trap 1 warns
  // about. Redirecting rather than rendering an empty shell means that failure
  // is visible instead of silent.
  if (!result?.profile) redirect('/login')

  const { user, profile } = result
  const name = profile.full_name || user.email || 'Admin'
  const email = profile.email || user.email || ''

  return (
    <div className="flex h-full w-full">
      <Sidebar name={name} initials={initialsOf(name)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-console-app">
        <Topbar name={name} email={email} initials={initialsOf(name)} />
        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[26px] pt-[22px] pb-10">
          {children}
        </div>
      </div>
    </div>
  )
}

// "Priya Menon" → "PM"; "admin@test" → "AD". Falls back rather than throwing:
// an avatar is not worth a 500 on every screen in the console.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AD'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
