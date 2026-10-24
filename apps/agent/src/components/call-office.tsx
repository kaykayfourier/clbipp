import { Button } from '@clbipp/ui'

// ─── "Call the office" (FV6 · M2) ────────────────────────────────────────────
// Configured, not hardcoded: the company has not given us the number yet.
// Unset → the button renders DISABLED and says so, never a dead `tel:` link.
export function CallOfficeButton({ label = 'Call the office' }: { label?: string }) {
  const officePhone = process.env.NEXT_PUBLIC_OFFICE_PHONE ?? null
  if (officePhone) {
    return (
      <a href={`tel:${officePhone.replace(/\s+/g, '')}`}>
        <Button variant="secondary" fullWidth>
          {label}
        </Button>
      </a>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" fullWidth disabled>
        {label}
      </Button>
      <p className="text-center text-[11px] text-text-secondary">Office line not connected yet</p>
    </div>
  )
}
