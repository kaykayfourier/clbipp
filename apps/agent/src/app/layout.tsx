// Scaffold only — the Field Agent app is built after the customer app ships
// (Plan v2 §9). Auth middleware comes free from @clbipp/auth/middleware with
// allowRoles: ['agent'] once this app is started for real.
export const metadata = { title: "CLBIPP — Field Agent" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
