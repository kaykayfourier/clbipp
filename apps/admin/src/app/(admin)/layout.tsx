import { ConsoleShell } from '@/components/shell'

// 🔴 THE ONLY FILE SHARED ACROSS ALL THREE LANES THIS SPRINT.
//
// Created once, in Batch 0, by A. Nobody edits it afterwards — that is the
// whole arrangement §4 of docs/PLAN_ADMIN_APP.md is built on, and it is what
// lets B and C replace their own route stubs without ever colliding with each
// other or with A. If you think you need to change this file, say so in
// docs/LANE_OWNERSHIP.md first.
//
// It does one thing: render the desktop console chrome around every
// authenticated screen. Screens themselves render NO shell — no ConsoleShell,
// and certainly no AppShell or PhoneFrame, which are the mobile kit's and are
// forbidden here (AD11, trap 15).
//
// Note what is deliberately absent, compared with apps/agent's (agent)/layout:
// there is no bottom-nav clearance, because there is no bottom nav. The agent
// app's rule that "every screen must pass hideNav" has no analogue here, and a
// screen that reaches for `hideNav` has imported something it should not have.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>
}
