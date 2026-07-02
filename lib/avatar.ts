// Deterministic avatar color + initials from a display name (mockup palette).

const PALETTE = [
  "#0f766e", // teal-700
  "#9333ea", // purple-600
  "#b45309", // amber-700
  "#1d4ed8", // blue-700
  "#be123c", // rose-700
  "#0369a1", // sky-700
  "#7c3aed", // violet-600
  "#15803d", // green-700
  "#a16207", // yellow-700
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
