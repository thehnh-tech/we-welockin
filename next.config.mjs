/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hooks own idempotent, cancellation-guarded cleanups, so the dev
  // double-invoke is safe and surfaces lifecycle bugs early.
  reactStrictMode: true,
};

export default nextConfig;
