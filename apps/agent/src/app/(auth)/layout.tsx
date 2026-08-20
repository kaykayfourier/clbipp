// The login screen owns its own full-screen frame via <AppShell hideNav>. This
// group layout is a passthrough — a centring wrapper here would fight
// AppShell's min-h-screen structure. Same as apps/customer's (auth)/layout.tsx.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
