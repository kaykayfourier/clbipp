// ─── Times, in one timezone, on purpose ──────────────────────────────────────
// Every date this console shows or writes is IST (Asia/Kolkata), stated
// explicitly rather than inherited from wherever the process happens to run.
//
// Why this file exists: on Vercel the server clock is UTC. Batch 0 already hit
// the harmless version of that (the Topbar's "Good morning" greets on server
// time) and its comment warns against deriving a *reported* date that way.
// Dispatch is where it stops being harmless — an admin picking a 10:00 slot in
// a <input type="datetime-local"> submits the bare string "2026-08-28T10:00"
// with no offset at all, and `new Date(...)` on the server would read it as
// 10:00 UTC = 15:30 IST. The agent would turn up five and a half hours late.
//
// 🔴 So the console FIXES the offset instead of guessing it: a submitted local
// time means IST, and every rendered time is formatted in IST. That is correct
// for this business (one country, one timezone) and it is deterministic on any
// machine. If CLBIPP ever operates outside IST, this file is the one place that
// assumption lives — and the honest fix then is to send the browser's offset
// with the form, not to widen this.

const IST_OFFSET = '+05:30'
const IST_TZ = 'Asia/Kolkata'

/**
 * Parses the `YYYY-MM-DDTHH:mm` a datetime-local input submits, AS IST.
 * Returns null for anything that is not that shape — a hand-crafted POST is
 * exactly as likely as a real one here (AD3: no RLS behind this).
 */
export function parseIstLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const parsed = new Date(`${match[0]}:00${IST_OFFSET}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The reverse: a Date → the `YYYY-MM-DDTHH:mm` a datetime-local input wants, in IST. */
export function toIstLocalValue(date: Date): string {
  // formatToParts rather than formatting a string and splitting it: the
  // separator a locale puts between date and time is not stable across ICU
  // versions, and this runs on both a Mac and Vercel's Linux.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'

  // hour12:false can render midnight as "24" in some ICU builds — normalise it.
  const hour = get('hour') === '24' ? '00' : get('hour')

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** "28 Aug 2026, 10:00 am" — IST, whatever the server clock says. */
export function formatIstDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** "28 Aug 2026" — for a date-only column (`preferred_date` is a DATE). */
export function formatIstDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * "3d 4h" — how long a request has been sitting there. The dispatch board is
 * sorted oldest-first, so this column is the one that says why.
 */
export function formatAge(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}
