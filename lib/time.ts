// Format a (possibly negative) number of seconds as a clock string.
//   65   -> "01:05"
//   3661 -> "1:01:01"
//   <=0  -> "00:00"
export function formatClock(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Always with an hours digit: 3530 -> "0:58:50", 8091 -> "2:14:51".
// Used for per-person focus time (mockup format).
export function formatDuration(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Compact hours for stats: 6120 -> "1:42", 0 -> "0:00" (h:mm).
export function formatHours(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}
