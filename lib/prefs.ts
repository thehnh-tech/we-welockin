"use client";

import { useEffect, useState } from "react";

// Interface preferences, persisted locally. Components subscribe via
// usePrefs(); writes go through setPrefs() which notifies every subscriber.

export type Prefs = {
  sound: boolean; // end-of-session chime
  notifications: boolean; // system notification at the end
  reducedMotion: boolean; // force-disable animations (on top of the OS setting)
  tint: string; // avatar tint key ("" = automatic from the name)
};

export const DEFAULT_PREFS: Prefs = {
  sound: true,
  notifications: true,
  reducedMotion: false,
  tint: "",
};

const KEY = "wlis_prefs_v1";
const EVENT = "wlis-prefs-changed";

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return {
      sound: p.sound !== false,
      notifications: p.notifications !== false,
      reducedMotion: p.reducedMotion === true,
      tint: typeof p.tint === "string" ? p.tint : "",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(update: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...update };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  applyReducedMotion(next.reducedMotion);
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
  return next;
}

export function applyReducedMotion(on: boolean): void {
  try {
    document.documentElement.classList.toggle("wl-reduce", on);
  } catch {}
}

export function usePrefs(): Prefs {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const sync = () => setState(getPrefs());
    sync();
    applyReducedMotion(getPrefs().reducedMotion);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return prefs;
}
