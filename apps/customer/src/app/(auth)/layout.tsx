// Auth screens own their own full-screen frame via C's <AppShell> (header +
// content + hideNav). This group layout is just a passthrough — no centering
// wrapper, which would fight AppShell's min-h-screen structure.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
