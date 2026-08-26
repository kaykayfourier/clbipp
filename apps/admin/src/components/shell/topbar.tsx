import { SearchIcon } from './icons'
import { UserMenu } from './user-menu'

// The light header strip (the wireframe's .ctop): greeting, timestamp, search,
// and the account menu that carries logout (W14).

type TopbarProps = {
  name: string
  email: string
  initials: string
}

// The wireframe hardcodes "Good morning". Deriving it costs one call and stops
// the console greeting a night-shift dispatcher with the wrong time of day.
//
// ⚠ Rendered on the server, so this is the SERVER's clock, not the viewer's —
// which on Vercel means UTC, not IST. Acceptable for a greeting and nothing
// else: never derive a date a screen actually reports on this way.
function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Topbar({ name, email, initials }: TopbarProps) {
  const now = new Date()
  const firstName = name.split(' ')[0] || name

  return (
    <header className="flex flex-shrink-0 items-center gap-4 border-b border-console-line px-[26px] py-4">
      <div>
        <div className="font-display text-[17px] font-medium text-text-primary">
          {greeting(now)}, {firstName}
        </div>
        <div className="mt-px font-mono text-[10px] text-text-secondary">
          {now.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </div>

      <div className="flex-1" />

      {/*
        A real GET form, not the wireframe's decorative pill.
        W14 lists "a search results screen for the topbar search" as missing,
        and §2 adds no /search route — so rather than invent a twentieth screen,
        this posts into the screen that is already specified to have search:
        B04 /pickups searches "by pickup id / vendor / agent" (Batch 5).

        🔴 CONTRACT WITH BATCH 5 (C's lane): /pickups must read `searchParams.q`.
        Until it does, this box navigates and silently shows an unfiltered list,
        which reads as a broken feature rather than an absent one. Logged in the
        Batch 0 as-built notes and added to Batch 5's done-when.
      */}
      <form action="/pickups" method="get" className="w-[280px]">
        <label className="flex items-center gap-2 rounded-full border border-console-line bg-background px-3.5 py-2 focus-within:border-border-strong">
          <span className="flex-shrink-0 text-text-secondary">
            <SearchIcon />
          </span>
          <span className="sr-only">Search pickups</span>
          <input
            type="search"
            name="q"
            placeholder="Search pickup id, vendor, agent…"
            className="w-full bg-transparent text-[11.5px] text-text-primary placeholder:text-text-secondary focus:outline-none"
          />
        </label>
      </form>

      <UserMenu name={name} email={email} initials={initials} />
    </header>
  )
}
