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

// Rounded human duration for stats (charter: numbers shown to the user are
// always rounded — h:mm:ss is reserved for the central chrono). No glued unit
// suffixes: 2520 -> "42 min", 6120 -> "1h 42", 0 -> "0 min".
export function formatShortDuration(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, "0")}`;
}
