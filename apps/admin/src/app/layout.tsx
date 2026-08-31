import type { Metadata, Viewport } from "next";

import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

import "./globals.css";

// The same three families as apps/customer and apps/agent — the three apps are
// one product and must not look like three.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

// Deliberately SHORTER than the other two apps' metadata blocks. There is no
// `manifest`, no `appleWebApp` and no icon set here: the admin console is a
// desktop app, not a PWA (AD11, R5). Adding a manifest would also trip trap 2 —
// every file it names has to be excluded in src/proxy.ts's matcher.
export const metadata: Metadata = {
  title: "Back2Basics — Admin Console",
  description: "Operations, pricing rules and EPR compliance.",
  applicationName: "Back2Basics Admin Console",
  // The console is internal and shows every price in the business; it has no
  // business appearing in a search index even if it were ever reachable.
  robots: { index: false, follow: false },
  // Browser tab icon only — NOT a PWA (AD11, R5). Deliberately no `manifest`,
  // no `appleWebApp`, and no 192/512 PNGs: this is a desktop console in a
  // normal browser window with nothing to install to a home screen, which is
  // exactly what separates it from the customer and agent apps.
  //
  // A single SVG is enough — every browser this console targets supports SVG
  // favicons. It must stay excluded in src/proxy.ts's matcher or the guard
  // redirects it to /login and the tab falls back to a blank glyph.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

// No <ServiceWorkerRegister />, unlike apps/agent — see the metadata note above.
//
// `h-screen overflow-hidden` rather than the mobile apps' `min-h-full`: the
// console shell is a fixed-height two-column frame whose main column scrolls on
// its own (the wireframe's .cbody). Letting the document scroll instead would
// take the sidebar and topbar with it.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
