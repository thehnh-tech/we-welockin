// Letter tokens tinted with the charte's category palette (§ Couleurs) —
// pastel background + darker letter, deterministic per display name.

export type Tint = { key: string; label: string; bg: string; fg: string };

export const TINTS: Tint[] = [
  { key: "bleu", label: "Bleu", bg: "#dce8f3", fg: "#5a7db8" },
  { key: "rose", label: "Rose", bg: "#fbe4e0", fg: "#b07a70" },
  { key: "vert", label: "Vert", bg: "#ddefdc", fg: "#54a078" },
  { key: "violet", label: "Violet", bg: "#ede3f0", fg: "#8a6b96" },
  { key: "ambre", label: "Ambre", bg: "#f4e7d6", fg: "#b08646" },
  { key: "sable", label: "Sable", bg: "#ece7df", fg: "#6b6258" },
  { key: "sarcelle", label: "Sarcelle", bg: "#d8e6e4", fg: "#4f8a86" },
];

export function tintByKey(key: string | undefined | null): Tint | null {
  if (!key) return null;
  return TINTS.find((t) => t.key === key) ?? null;
}

export function avatarTint(name: string): Tint {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[h % TINTS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
