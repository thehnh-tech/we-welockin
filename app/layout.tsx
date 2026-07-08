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
    // suppressHydrationWarning: the head script below sets data-wl-* theme
    // attributes before hydration (anti-flash), which React would otherwise
    // report as a server/client mismatch — same pattern as next-themes.
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <head>
        {/* Apply theme / accent / reduced-motion before first paint
            (anti-flash: CSS variables key off these attributes). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var p=JSON.parse(localStorage.getItem("wlis_prefs_v1")||"{}"),e=document.documentElement;e.dataset.wlTheme=["papier","gris","encre"].indexOf(p.theme)>=0?p.theme:"papier";e.dataset.wlAccent=["red","terracotta","vert","bleu","violet","sarcelle","ambre"].indexOf(p.accent)>=0?p.accent:"red";if(p.reducedMotion===true)e.classList.add("wl-reduce")}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
