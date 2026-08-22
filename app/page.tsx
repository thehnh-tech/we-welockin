import type { Metadata } from "next";
import HomeView from "@/components/HomeView";
import { OG_BASE } from "@/lib/site";

// A server component so the home page can own the canonical URL and og:url.
// They must NOT live in the root layout: Next merges metadata shallowly, so
// every route (rooms included) would inherit "/" as its canonical.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OG_BASE, url: "/" },
};

export default function Page() {
  return <HomeView />;
}
