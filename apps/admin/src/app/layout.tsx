// Scaffold only — the Admin dashboard is built last (Plan v2 §9). Auth
// middleware comes free from @clbipp/auth/middleware with allowRoles: ['admin']
// once this app is started for real.
export const metadata = { title: "CLBIPP — Admin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
