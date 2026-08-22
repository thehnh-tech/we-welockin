import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/site";

// Social-share card (Open Graph + Twitter fall back to this). Generated at
// request time by Satori — keep it to simple flex layout + system fonts.

export const alt = SITE_DESCRIPTION;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1a1714",
          color: "#f6f1e6",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          {/* Padlock mark */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e2483a"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 018 0v3" />
          </svg>
          <div style={{ display: "flex" }}>
            welock
            <span style={{ color: "#e2483a" }}>.in</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Lock in.</span>
            <span style={{ color: "#e2483a" }}>Study together.</span>
          </div>
          <div
            style={{
              fontSize: 32,
              color: "rgba(246, 241, 230, 0.74)",
              display: "flex",
            }}
          >
            Video study rooms · shared focus timer · your crew
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 26,
            fontWeight: 600,
            color: "rgba(246, 241, 230, 0.74)",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#54a078",
              display: "flex",
            }}
          />
          Students are locked in right now — join them
        </div>
      </div>
    ),
    { ...size }
  );
}
