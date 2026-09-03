"use client";

import { useEffect, useState } from "react";

// Reads the university-verification cookie's status through the API (the
// cookie itself is httpOnly, so the client can only ask). Purely for UI: the
// real gate is server-side on every room join.

export type VerifiedState = {
  loaded: boolean;
  verified: boolean;
  institution: string;
  /** The verified email's domain, as matched ("epfl.ch"); "" when not. */
  domain: string;
};

const PENDING: VerifiedState = {
  loaded: false,
  verified: false,
  institution: "",
  domain: "",
};

const UNVERIFIED: VerifiedState = {
  loaded: true,
  verified: false,
  institution: "",
  domain: "",
};

export function useVerified(enabled = true) {
  const [state, setState] = useState<VerifiedState>(PENDING);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/verify/status", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setState({
          loaded: true,
          verified: data.verified === true,
          institution:
            typeof data.institution === "string" ? data.institution : "",
          domain: typeof data.domain === "string" ? data.domain : "",
        });
      } catch {
        // Offline or a server hiccup: treat as unverified rather than
        // leaving the UI stuck on a spinner.
        if (alive) setState(UNVERIFIED);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return [state, setState] as const;
}
