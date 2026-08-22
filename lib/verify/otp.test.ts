import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, normalizeOtpInput } from "./otp";

describe("generateOtp", () => {
  it("always returns 6 digits (padded)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtp", () => {
  it("is deterministic and hex", () => {
    const h = hashOtp("a@epfl.ch", "123456", "s");
    expect(h).toBe(hashOtp("a@epfl.ch", "123456", "s"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds to email, code and secret", () => {
    const base = hashOtp("a@epfl.ch", "123456", "s");
    expect(hashOtp("b@epfl.ch", "123456", "s")).not.toBe(base);
    expect(hashOtp("a@epfl.ch", "654321", "s")).not.toBe(base);
    expect(hashOtp("a@epfl.ch", "123456", "t")).not.toBe(base);
  });
});

describe("normalizeOtpInput", () => {
  it("accepts 6 digits with separators", () => {
    expect(normalizeOtpInput("123456")).toBe("123456");
    expect(normalizeOtpInput(" 123 456 ")).toBe("123456");
    expect(normalizeOtpInput("123-456")).toBe("123456");
  });

  it("rejects anything else", () => {
    expect(normalizeOtpInput("12345")).toBeNull();
    expect(normalizeOtpInput("1234567")).toBeNull();
    expect(normalizeOtpInput("abcdef")).toBeNull();
    expect(normalizeOtpInput("")).toBeNull();
  });
});
