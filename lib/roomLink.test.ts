import { describe, expect, it } from "vitest";
import { buildRoomUrl, parseRoomParams } from "./roomLink";

function paramsOf(url: string) {
  const qs = new URLSearchParams(url.split("?")[1] ?? "");
  return { n: qs.get("n"), d: qs.get("d"), s: qs.get("s") };
}

describe("roomLink", () => {
  it("round-trips meta through build + parse", () => {
    const meta = {
      id: "abc123",
      name: "Révisions maths",
      durationSec: 1500,
      startedAt: 1782573741066,
    };
    const url = buildRoomUrl(meta);
    expect(url.startsWith("/room/abc123?")).toBe(true);

    const parsed = parseRoomParams(paramsOf(url));
    expect(parsed).toEqual({
      name: "Révisions maths",
      durationSec: 1500,
      startedAt: 1782573741066,
    });
  });

  it("returns null when a param is missing", () => {
    expect(parseRoomParams({ n: "X", d: "1500", s: null })).toBeNull();
    expect(parseRoomParams({ n: null, d: "1500", s: "1" })).toBeNull();
  });

  it("rejects durations below 60s and non-numeric values", () => {
    expect(parseRoomParams({ n: "X", d: "30", s: "1" })).toBeNull();
    expect(parseRoomParams({ n: "X", d: "abc", s: "1" })).toBeNull();
  });

  it("falls back to a default name when empty", () => {
    const parsed = parseRoomParams({ n: "", d: "1500", s: "1" });
    expect(parsed?.name).toBe("Study session");
  });
});
