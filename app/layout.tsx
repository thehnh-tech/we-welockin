import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// One family carries everything (numerals included) — charte §03.
// Self-hosted at build time by next/font, no runtime request.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "welock.in",
  description: "Lock in. Study together.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
