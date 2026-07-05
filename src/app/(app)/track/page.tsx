// The Track tab in the bottom nav links to /track (no id). Without an id there's
// nothing to show — redirect to the dashboard where users can tap a pickup row.
import { redirect } from 'next/navigation'

export default function TrackIndexPage() {
  redirect('/dashboard')
}
