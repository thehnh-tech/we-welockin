"use client";

// Inline university-email verification: email -> 6-digit code -> verified
// cookie. Unknown domains surface the "Request your institution" flow.

import { useEffect, useState } from "react";

export type VerifiedInfo = {
  email: string;
  domain: string;
  institution: string;
};

const inputCls =
  "w-full rounded-[11px] border border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-accentink";

const primaryBtnCls =
  "wl-lift rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-surface shadow-xs disabled:bg-track disabled:text-faint";

const normalize = (s: string) => s.trim().toLowerCase();
const digitsOf = (s: string) => s.replace(/\D/g, "");

export default function VerifyUniversity({
  onVerified,
}: {
  onVerified: (v: VerifiedInfo) => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [institution, setInstitution] = useState("");
  // The server throttles resends PER EMAIL, so the cooldown must be tied to
  // the address it was earned on — otherwise correcting a typo leaves the
  // button dead for a minute on an address the server would happily accept.
  const [cooldown, setCooldown] = useState(0);
  const [cooldownEmail, setCooldownEmail] = useState("");

  // "Request your institution" sub-flow, shown when the domain is unknown.
  const [unknownDomain, setUnknownDomain] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqSite, setReqSite] = useState("");
  const [reqSent, setReqSent] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only blocks the address that actually has a code in flight.
  const activeCooldown =
    cooldown > 0 && normalize(email) === cooldownEmail ? cooldown : 0;

  const sendCode = async () => {
    if (busy || activeCooldown > 0) return;
    setBusy(true);
    setError(null);
    setUnknownDomain(null);
    setShowRequest(false);
    try {
      const res = await fetch("/api/verify/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInstitution(data.institution ?? "");
        setStep("code");
        setCode("");
        setCooldown(60);
        setCooldownEmail(normalize(email));
        return;
      }
      switch (data.error) {
        case "invalid":
          setError("That doesn't look like an email address.");
          break;
        case "personal":
          setError(
            "That's a personal address — use the one your university gave you."
          );
          break;
        case "unknown":
          setUnknownDomain(typeof data.domain === "string" ? data.domain : "");
          break;
        case "cooldown":
          // A code is already on its way — jump to the code step.
          setStep("code");
          setCooldown(Number(data.retryAfterSec) || 60);
          setCooldownEmail(normalize(email));
          break;
        case "send_failed":
          setError("We couldn't send the email. Try again in a minute.");
          break;
        default:
          setError(
            res.status === 429
              ? "Too many attempts — try again later."
              : "Something went wrong. Try again."
          );
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    // Same guard as the Verify button — Enter must not reach the server with
    // a half-typed code and come back as a generic failure.
    if (busy || digitsOf(code).length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onVerified({
          email: normalize(email),
          domain: data.domain ?? "",
          institution: data.institution ?? institution,
        });
        return;
      }
      switch (data.error) {
        case "invalid":
          setError("Enter the full 6-digit code.");
          break;
        case "wrong_code": {
          const left = Number(data.attemptsLeft);
          setError(
            !Number.isFinite(left)
              ? "Wrong code."
              : left > 0
                ? `Wrong code — ${left} ${left === 1 ? "try" : "tries"} left.`
                : "Wrong code — that was the last try. Send a new code."
          );
          break;
        }
        case "expired":
          setError("That code expired. Send yourself a new one.");
          break;
        case "too_many_attempts":
          setError("Too many wrong tries — send a new code.");
          break;
        default:
          setError(
            res.status === 429
              ? "Too many attempts — try again later."
              : "Something went wrong. Try again."
          );
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestInstitution = async () => {
    if (reqBusy) return;
    setReqBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/institutions/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          institution: reqName,
          website: reqSite,
        }),
      });
      if (res.ok) {
        setReqSent(true);
      } else {
        setError(
          res.status === 429
            ? "Too many requests today — try again tomorrow."
            : "Couldn't send the request. Try again."
        );
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setReqBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-hairline bg-card p-4 animate-wl-rise">
      <div className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <CapIcon />
        Students only
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text3">
        Public rooms go on the shared feed, so we check you&apos;re at a real
        school. One code, valid a month.
      </p>

      {step === "email" && (
        <>
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
                setUnknownDomain(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendCode();
                }
              }}
              type="email"
              placeholder="you@university.edu"
              maxLength={254}
              aria-label="University email"
              className={`min-w-0 flex-1 ${inputCls}`}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || !email.trim() || activeCooldown > 0}
              className={primaryBtnCls}
            >
              {busy
                ? "Sending…"
                : activeCooldown > 0
                  ? `Wait ${activeCooldown}s`
                  : "Send code"}
            </button>
          </div>

          {unknownDomain !== null && !showRequest && !reqSent && (
            <div className="mt-2.5 text-xs leading-relaxed text-text2">
              We don&apos;t recognize{" "}
              <span className="font-semibold text-ink">
                {unknownDomain || "that domain"}
              </span>{" "}
              yet.{" "}
              <button
                type="button"
                onClick={() => setShowRequest(true)}
                className="font-bold text-accentink underline underline-offset-2"
              >
                Request your institution
              </button>{" "}
              and we&apos;ll add it.
            </div>
          )}

          {showRequest && !reqSent && (
            <div className="mt-2.5 flex flex-col gap-2 animate-wl-rise">
              <input
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
                placeholder="Institution name"
                maxLength={120}
                aria-label="Institution name"
                className={inputCls}
              />
              <input
                value={reqSite}
                onChange={(e) => setReqSite(e.target.value)}
                placeholder="Website (optional)"
                maxLength={200}
                aria-label="Institution website"
                className={inputCls}
              />
              <button
                type="button"
                onClick={requestInstitution}
                disabled={reqBusy || reqName.trim().length < 2}
                className={`${primaryBtnCls} w-fit`}
              >
                {reqBusy ? "Sending…" : "Send request"}
              </button>
            </div>
          )}

          {reqSent && (
            <p className="mt-2.5 text-xs font-medium text-ink" role="status">
              Request sent — we&apos;ll add your school soon. 🎓
            </p>
          )}
        </>
      )}

      {step === "code" && (
        <>
          <p className="mb-2 text-xs text-text2">
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-ink">{email.trim()}</span>
            {institution ? (
              <>
                {" "}
                (<span className="font-semibold">{institution}</span>)
              </>
            ) : null}
            .
          </p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/[^0-9 ]/g, "").slice(0, 7));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="6-digit verification code"
              className={`min-w-0 flex-1 tracking-[.3em] font-semibold tabular-nums ${inputCls}`}
              autoFocus
            />
            <button
              type="button"
              onClick={confirm}
              disabled={busy || digitsOf(code).length !== 6}
              className={primaryBtnCls}
            >
              {busy ? "Checking…" : "Verify"}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-text3">
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || activeCooldown > 0}
              className="font-semibold text-text2 underline underline-offset-2 disabled:no-underline disabled:text-faint"
            >
              {activeCooldown > 0
                ? `Resend in ${activeCooldown}s`
                : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="font-semibold text-text2 underline underline-offset-2"
            >
              Change email
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CapIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </svg>
  );
}
