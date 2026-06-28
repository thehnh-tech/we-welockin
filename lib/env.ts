// Minimal, dependency-free env access for the shared store.
//
// Redis is OPTIONAL: when no credentials are present we fall back to the
// in-memory backend (fine for local dev / single instance, but presence does
// not survive across serverless instances — see README). Provide either the
// Upstash REST names or the Vercel KV names.

export type RedisEnv = { url: string; token: string };

let cached: RedisEnv | null | undefined;

export function getRedisEnv(): RedisEnv | null {
  if (cached !== undefined) return cached;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    "";
  cached = url && token ? { url, token } : null;
  return cached;
}

export function isRedisConfigured(): boolean {
  return getRedisEnv() !== null;
}
