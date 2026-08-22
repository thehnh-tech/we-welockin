import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import {
  OG_BASE,
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";
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
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "study rooms",
    "study with me",
    "virtual study room",
    "focus timer",
    "pomodoro with friends",
    "video study group",
    "body doubling",
    "university students",
    "lock in",
  ],
  category: "education",
  // No canonical / og:url here on purpose — both are per-route (see
  // app/page.tsx and app/room/[id]/layout.tsx). Metadata merges shallowly, so
  // anything set here is inherited by every page.
  openGraph: OG_BASE,
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeae2" },
    { media: "(prefers-color-scheme: dark)", color: "#17130f" },
  ],
};

// Structured data for rich results — the app itself, free to use.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
