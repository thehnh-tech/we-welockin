import { describe, expect, it } from "vitest";
import { signVerifiedToken, verifyVerifiedToken } from "./token";

const SECRET = "test-secret";
const payload = {
  email: "someone@epfl.ch",
  domain: "epfl.ch",
  institution: "Swiss Federal Institute of Technology, Lausanne",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("verified token", () => {
  it("round-trips sign -> verify", () => {
    const token = signVerifiedToken(payload, SECRET);
    expect(verifyVerifiedToken(token, SECRET)).toEqual(payload);
  });

  it("rejects a tampered body", () => {
    const token = signVerifiedToken(payload, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...payload, institution: "Fake U" }),
      "utf8"
    ).toString("base64url");
    expect(verifyVerifiedToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyVerifiedToken(`${body}.AAAA`, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signVerifiedToken(payload, "other-secret");
    expect(verifyVerifiedToken(token, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signVerifiedToken({ ...payload, exp: 100 }, SECRET);
    expect(verifyVerifiedToken(token, SECRET)).toBeNull();
  });

  it("answers the no-token case without needing a secret", () => {
    // Production throws when AUTH_SECRET is unset; a visitor with no cookie
    // must not trigger that on a plain status check.
    expect(verifyVerifiedToken(undefined)).toBeNull();
    expect(verifyVerifiedToken(null)).toBeNull();
    expect(verifyVerifiedToken("")).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    expect(verifyVerifiedToken(undefined, SECRET)).toBeNull();
    expect(verifyVerifiedToken("", SECRET)).toBeNull();
    expect(verifyVerifiedToken("no-dot", SECRET)).toBeNull();
    expect(verifyVerifiedToken("a.b.c.d", SECRET)).toBeNull();
    expect(verifyVerifiedToken("x".repeat(5000), SECRET)).toBeNull();
  });

  it("rejects a structurally wrong payload even when signed", () => {
    const body = Buffer.from(
      JSON.stringify({ email: "a@b.co", exp: "soon" }),
      "utf8"
    ).toString("base64url");
    // Sign the wrong body with the right secret via the public API:
    const good = signVerifiedToken(payload, SECRET);
    const sigOfGood = good.split(".")[1];
    expect(verifyVerifiedToken(`${body}.${sigOfGood}`, SECRET)).toBeNull();
  });
});
