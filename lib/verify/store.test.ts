import { describe, expect, it } from "vitest";
import { claimAttempt, deleteCode, getCode, putCode } from "./store";
import { OTP_MAX_ATTEMPTS } from "./otp";

// No MONGODB_URI under test, so this exercises the in-process backend.

let n = 0;
const email = () => `student${n++}@epfl.ch`;

describe("claimAttempt", () => {
  it("returns null when there is no pending code", async () => {
    expect(await claimAttempt(email(), Date.now())).toBeNull();
  });

  it("counts from 1 and never reuses a number under concurrency", async () => {
    const e = email();
    const now = Date.now();
    await putCode(e, "hash", now);

    // The bug this guards: read-then-increment let parallel confirms all see
    // the same pre-increment count, so every one of them passed the cap and
    // the 6-digit code could be ground down. Each claim must get its own slot.
    const claims = await Promise.all(
      Array.from({ length: 20 }, () => claimAttempt(e, now))
    );
    const attempts = claims.map((c) => c?.attempts);
    expect(attempts).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // Past the cap the route rejects, so only the first OTP_MAX_ATTEMPTS
    // claims can reach a code comparison.
    expect(attempts.filter((a) => (a ?? 0) <= OTP_MAX_ATTEMPTS).length).toBe(
      OTP_MAX_ATTEMPTS
    );
  });

  it("does not leak later mutations through an earlier snapshot", async () => {
    const e = email();
    const now = Date.now();
    await putCode(e, "hash", now);
    const first = await claimAttempt(e, now);
    await claimAttempt(e, now);
    expect(first?.attempts).toBe(1);
  });

  it("treats an expired code as absent", async () => {
    const e = email();
    const issued = Date.now() - 60 * 60_000; // an hour ago
    await putCode(e, "hash", issued);
    expect(await claimAttempt(e, Date.now())).toBeNull();
    expect(await getCode(e, Date.now())).toBeNull();
  });

  it("stops after the code is deleted", async () => {
    const e = email();
    const now = Date.now();
    await putCode(e, "hash", now);
    await deleteCode(e);
    expect(await claimAttempt(e, now)).toBeNull();
  });

  it("resets the counter when a fresh code is issued", async () => {
    const e = email();
    const now = Date.now();
    await putCode(e, "hash", now);
    await claimAttempt(e, now);
    await claimAttempt(e, now);
    await putCode(e, "hash2", now);
    expect((await claimAttempt(e, now))?.attempts).toBe(1);
  });
});
