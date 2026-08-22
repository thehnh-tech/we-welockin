import type { Metadata } from "next";
import { OG_BASE } from "@/lib/site";

// Rooms are ephemeral, code-gated spaces — keep them out of search indexes.
// The page stays CRAWLABLE (robots.txt does not disallow /room/) for two
// reasons: a noindex a crawler is forbidden to fetch is a noindex it never
// sees, and room links are the invite mechanism, so preview bots that honor
// robots.txt must be able to fetch the Open Graph card.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Focus room",
    robots: { index: false, follow: false },
    openGraph: { ...OG_BASE, url: `/room/${encodeURIComponent(id)}` },
  };
}

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
