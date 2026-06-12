const KEY = "wlis_pseudo";

export function getPseudo(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + KEY + "=([^;]*)")
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

export function setPseudo(value: string) {
  if (typeof document === "undefined") return;
  const v = encodeURIComponent(value.trim().slice(0, 30));
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${KEY}=${v}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function clearPseudo() {
  if (typeof document === "undefined") return;
  document.cookie = `${KEY}=; path=/; max-age=0; SameSite=Lax`;
}
