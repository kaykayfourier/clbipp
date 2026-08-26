'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NavIcon } from './icons'
import { NAV_GROUPS, isNavItemActive } from './nav'

// The dark rail (the wireframe's .csb). A client component purely for
// usePathname — the active item has to be known per-route, and a server
// component in a layout would not re-evaluate on client navigation, leaving the
// highlight stuck on whatever you first landed on.
//
// 🔴 Not in packages/ui, and it must not move there (AD11/AD12). packages/ui is
// a MOBILE kit imported by two shipped apps; a 212px desktop rail has no
// consumer there, and nothing an admin sees may reach a vendor screen.

type SidebarProps = {
  name: string
  initials: string
}

export function Sidebar({ name, initials }: SidebarProps) {
  const pathname = usePathname()

  return (
    <nav
      // The smoke run counts navigation landmarks. The mobile apps assert
      // exactly one aria-label="Main navigation"; this is the console's, and
      // there is deliberately only one nav in the whole shell.
      aria-label="Main navigation"
      className="flex w-[212px] flex-shrink-0 flex-col overflow-y-auto bg-console-rail px-3.5 py-5 text-console-rail-text"
    >
      <div className="mb-4 flex items-center gap-[9px] border-b border-console-rail-line px-1.5 pb-5">
        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-primary-green text-xs font-extrabold text-primary-black">
          B2
        </div>
        <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-console-rail-text-strong">
          Console
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-[18px]">
          <div className="px-2 pb-2 font-mono text-[9px] tracking-[0.14em] uppercase text-console-rail-muted">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'mb-px flex items-center gap-2.5 rounded-lg px-2 py-2 text-[12.5px] font-semibold',
                  active
                    ? 'bg-console-rail-active text-primary-green'
                    : 'text-console-rail-text hover:bg-console-rail-hover',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-3.5 flex-shrink-0 font-mono text-[9.5px]',
                    active ? 'text-primary-green/70' : 'text-console-rail-muted',
                  ].join(' ')}
                >
                  {item.num}
                </span>
                <span className={active ? '' : 'opacity-75'}>
                  <NavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}

      {/* The wireframe's .csb-foot. Identity only — the sign-out control lives
          in the topbar's <UserMenu>, so there is exactly one of it. */}
      <div className="mt-auto flex items-center gap-[9px] border-t border-console-rail-line pt-3.5">
        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-console-rail-hover font-display text-[11px] font-bold text-console-rail-text-strong">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11.5px] font-bold text-console-rail-text-strong">
            {name}
          </div>
          <div className="font-mono text-[9.5px] text-console-rail-muted">ADMIN</div>
        </div>
      </div>
    </nav>
  )
}
