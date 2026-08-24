import type { Metadata, Viewport } from "next";

import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

// Same three families as apps/customer — the two apps are one product and must
// not look like two.
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

export const metadata: Metadata = {
  title: "Back2Basics — Field Agent",
  description: "Field agent intake, assessment and collection.",
  applicationName: "Back2Basics Field Agent",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "B2B Agent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    // iOS ignores the manifest's icons for home-screen install and reads this
    // one instead. Without it an installed agent app gets a screenshot of the
    // page as its icon.
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

// PWA + offline (deferred from Batch 8, built 2026-08-24). The icon is
// deliberately the INVERSE of the customer app's — black "FA" on lime, against
// their lime "B2" on black — because the two-device demo puts both on one home
// screen and two identical icons there is a support call waiting to happen.
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
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
