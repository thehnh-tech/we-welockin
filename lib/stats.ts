// Local focus-time stats: seconds studied per day in localStorage. Powers the
// home stats (today / streak / week). Storage and clock are injectable for
// tests; browser callers use the defaults.

export type KVStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const KEY = "wlis_focus_v1";
const KEEP_DAYS = 60;

type DayMap = Record<string, number>; // "2026-07-02" -> seconds

function defaultStorage(): KVStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode etc.)
  }
}

export function dateKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function load(storage: KVStorage): DayMap {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: DayMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function save(storage: KVStorage, map: DayMap, now: number): void {
  // Prune old entries so the payload stays tiny.
  const cutoff = dateKey(now - KEEP_DAYS * 86_400_000);
  const pruned: DayMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (k >= cutoff) pruned[k] = v;
  }
  try {
    storage.setItem(KEY, JSON.stringify(pruned));
  } catch {}
}

export function recordFocusSeconds(
  seconds: number,
  now: number = Date.now(),
  storage: KVStorage | null = defaultStorage()
): void {
  if (!storage || !Number.isFinite(seconds) || seconds <= 0) return;
  const map = load(storage);
  const key = dateKey(now);
  map[key] = (map[key] ?? 0) + Math.floor(seconds);
  save(storage, map, now);
}

export function getTodaySeconds(
  now: number = Date.now(),
  storage: KVStorage | null = defaultStorage()
): number {
  if (!storage) return 0;
  return load(storage)[dateKey(now)] ?? 0;
}

// Rolling 7 days including today.
export function getWeekSeconds(
  now: number = Date.now(),
  storage: KVStorage | null = defaultStorage()
): number {
  if (!storage) return 0;
  const map = load(storage);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    total += map[dateKey(now - i * 86_400_000)] ?? 0;
  }
  return total;
}

// Consecutive days with >= 60s of focus, counting back from today; today not
// yet studied doesn't break the streak (it just starts from yesterday).
export function getStreakDays(
  now: number = Date.now(),
  storage: KVStorage | null = defaultStorage()
): number {
  if (!storage) return 0;
  const map = load(storage);
  const MIN = 60;
  let streak = 0;
  let i = (map[dateKey(now)] ?? 0) >= MIN ? 0 : 1;
  for (; ; i++) {
    if ((map[dateKey(now - i * 86_400_000)] ?? 0) >= MIN) streak++;
    else break;
  }
  return streak;
}
