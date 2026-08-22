/** @type {import('next').NextConfig} */

// The app asks for camera and microphone, so being embeddable is dangerous:
// a hostile page could frame a room and trick someone into granting access to
// what looks like a study session. frame-ancestors 'none' (plus the legacy
// X-Frame-Options for older agents) makes that impossible.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let a browser second-guess a response's declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Room ids are in the URL and act as credentials for private rooms — never
  // leak a full room URL to a third-party site through the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only this origin may reach the devices; nothing else is used at all.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), " +
      "geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig = {
  // Hooks own idempotent, cancellation-guarded cleanups, so the dev
  // double-invoke is safe and surfaces lifecycle bugs early.
  reactStrictMode: true,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Presence and verification answers are per-caller and short-lived;
        // a shared cache holding one would serve someone else's state.
        //
        // Exactly one exception: GET /api/rooms (the feed) is identical for
        // every caller and sets its own s-maxage so the CDN can absorb the
        // home-page pollers. The negative lookahead exempts only that exact
        // path — /api/rooms/[id]/* stays no-store.
        source: "/api/:path((?!rooms$).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          ...securityHeaders,
        ],
      },
      { source: "/api/rooms", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
