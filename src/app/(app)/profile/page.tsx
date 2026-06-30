import { getCurrentProfile } from '@/lib/supabase/auth'
import { logout } from './actions'

// Minimal profile screen — doubles as the auth test harness (the post-login /
// post-signup landing) and the seed of the full Phase-2 profile screen.
// Deliberately shows NO recovery rate / recovered value (locked rule — the
// wireframe HTML is stale on this).
export default async function ProfilePage() {
  const data = await getCurrentProfile()
  // Middleware already guards this route; this is a defensive fallback only.
  const email = data?.user.email ?? 'unknown'
  const fullName = data?.profile?.full_name ?? email
  const vendorType = data?.profile?.vendor_type ?? '—'

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <div className="rounded-md border border-zinc-200 p-4">
        <p className="text-lg font-medium">Logged in as {fullName}</p>
        <dl className="mt-2 space-y-1 text-sm text-zinc-600">
          <div className="flex justify-between">
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Account type</dt>
            <dd>{vendorType}</dd>
          </div>
        </dl>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-md border border-zinc-300 py-2 font-medium"
        >
          Log out
        </button>
      </form>
    </main>
  )
}
