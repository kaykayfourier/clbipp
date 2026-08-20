import type { Metadata, Viewport } from "next";

import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

import "./globals.css";

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
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

// No <ServiceWorkerRegister /> and no manifest yet — PWA + offline is Batch 8.
// Registering a service worker now would cache the scaffold and then serve it
// back over the real screens as they land.
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
