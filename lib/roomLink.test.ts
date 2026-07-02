import { describe, expect, it } from "vitest";
import { buildRoomUrl, parseRoomParams } from "./roomLink";

function paramsOf(url: string) {
  const qs = new URLSearchParams(url.split("?")[1] ?? "");
  return { n: qs.get("n"), d: qs.get("d"), s: qs.get("s"), sub: qs.get("sub") };
}

describe("roomLink", () => {
  it("round-trips meta through build + parse", () => {
    const meta = {
      id: "abc123",
      name: "Révisions maths",
      durationSec: 1500,
      startedAt: 1782573741066,
      subject: "Chapitre 4",
    };
    const url = buildRoomUrl(meta);
    expect(url.startsWith("/room/abc123?")).toBe(true);

    const parsed = parseRoomParams(paramsOf(url));
    expect(parsed).toEqual({
      name: "Révisions maths",
      durationSec: 1500,
      startedAt: 1782573741066,
      subject: "Chapitre 4",
    });
  });

  it("omits the subject param when empty and parses it back as empty", () => {
    const url = buildRoomUrl({
      id: "x",
      name: "N",
      durationSec: 1500,
      startedAt: 1,
    });
    expect(url.includes("sub=")).toBe(false);
    expect(parseRoomParams(paramsOf(url))?.subject).toBe("");
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

  it("round-trips names containing % without throwing (no double-decode)", () => {
    const url = buildRoomUrl({
      id: "x",
      name: "Maths 50%",
      durationSec: 1500,
      startedAt: 1,
      subject: "100%25 raw",
    });
    const parsed = parseRoomParams(paramsOf(url));
    expect(parsed?.name).toBe("Maths 50%");
    expect(parsed?.subject).toBe("100%25 raw");
  });

  it("does not throw on raw percent sequences passed directly", () => {
    expect(() =>
      parseRoomParams({ n: "Promo %E0%A4%A", d: "1500", s: "1" })
    ).not.toThrow();
  });

  it("clamps oversized name/subject to the server limits", () => {
    const parsed = parseRoomParams({
      n: "x".repeat(5000),
      d: "1500",
      s: "1",
      sub: "y".repeat(5000),
    });
    expect(parsed?.name.length).toBe(60);
    expect(parsed?.subject.length).toBe(60);
  });
});
