import { describe, expect, it } from "vitest";
import {
  dateKey,
  getStreakDays,
  getTodaySeconds,
  getWeekSeconds,
  recordFocusSeconds,
  type KVStorage,
} from "./stats";

function mockStorage(): KVStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

const DAY = 86_400_000;
// Fixed reference: 2026-07-02 12:00 local.
const NOW = new Date(2026, 6, 2, 12, 0, 0).getTime();

describe("stats", () => {
  it("accumulates seconds for today", () => {
    const s = mockStorage();
    recordFocusSeconds(120, NOW, s);
    recordFocusSeconds(60, NOW, s);
    expect(getTodaySeconds(NOW, s)).toBe(180);
  });

  it("sums the rolling week", () => {
    const s = mockStorage();
    recordFocusSeconds(100, NOW, s);
    recordFocusSeconds(200, NOW - 3 * DAY, s);
    recordFocusSeconds(300, NOW - 6 * DAY, s);
    recordFocusSeconds(999, NOW - 8 * DAY, s); // out of window
    expect(getWeekSeconds(NOW, s)).toBe(600);
  });

  it("counts a streak of consecutive days", () => {
    const s = mockStorage();
    recordFocusSeconds(600, NOW, s);
    recordFocusSeconds(600, NOW - DAY, s);
    recordFocusSeconds(600, NOW - 2 * DAY, s);
    expect(getStreakDays(NOW, s)).toBe(3);
  });

  it("does not break the streak when today has no focus yet", () => {
    const s = mockStorage();
    recordFocusSeconds(600, NOW - DAY, s);
    recordFocusSeconds(600, NOW - 2 * DAY, s);
    expect(getStreakDays(NOW, s)).toBe(2);
  });

  it("breaks the streak on a gap day", () => {
    const s = mockStorage();
    recordFocusSeconds(600, NOW, s);
    recordFocusSeconds(600, NOW - 2 * DAY, s); // yesterday missing
    expect(getStreakDays(NOW, s)).toBe(1);
  });

  it("ignores sub-minute days for the streak", () => {
    const s = mockStorage();
    recordFocusSeconds(30, NOW, s);
    expect(getStreakDays(NOW, s)).toBe(0);
  });

  it("survives corrupted storage", () => {
    const s = mockStorage();
    s.setItem("wlis_focus_v1", "not json {{{");
    expect(getTodaySeconds(NOW, s)).toBe(0);
    recordFocusSeconds(60, NOW, s);
    expect(getTodaySeconds(NOW, s)).toBe(60);
  });

  it("prunes entries older than 60 days on write", () => {
    const s = mockStorage();
    recordFocusSeconds(600, NOW - 70 * DAY, s);
    recordFocusSeconds(600, NOW, s);
    const raw = JSON.parse(s.getItem("wlis_focus_v1")!);
    expect(Object.keys(raw)).toEqual([dateKey(NOW)]);
  });
});
