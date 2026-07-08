"use client";

import { useEffect, useState } from "react";

// Interface preferences, persisted locally. Components subscribe via
// usePrefs(); writes go through setPrefs() which applies the visual prefs to
// <html> (data attributes consumed by CSS variables) and notifies subscribers.

export type Prefs = {
  theme: "papier" | "gris" | "encre"; // warm paper / neutral gray / warm dark
  accent: string; // accent key (see ACCENTS in lib/theme)
  timerStyle: "anneau" | "minimal";
  timerSeconds: boolean; // show seconds on the chrono
  sound: boolean; // end-of-session chime
  notifications: boolean; // system notification at the end
  reducedMotion: boolean; // force-disable animations (on top of the OS setting)
  tint: string; // avatar tint key ("" = automatic from the name)
};

export const DEFAULT_PREFS: Prefs = {
  theme: "papier",
  accent: "red",
  timerStyle: "anneau",
  timerSeconds: true,
  sound: true,
  notifications: true,
  reducedMotion: false,
  tint: "",
};

const KEY = "wlis_prefs_v1";
const EVENT = "wlis-prefs-changed";

const THEMES = new Set(["papier", "gris", "encre"]);
const ACCENT_KEYS = new Set([
  "red",
  "terracotta",
  "vert",
  "bleu",
  "violet",
  "sarcelle",
  "ambre",
]);

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return {
      theme: THEMES.has(p.theme) ? p.theme : "papier",
      accent: ACCENT_KEYS.has(p.accent) ? p.accent : "red",
      timerStyle: p.timerStyle === "minimal" ? "minimal" : "anneau",
      timerSeconds: p.timerSeconds !== false,
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
  applyVisualPrefs(next, true);
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
  return next;
}

// Theme + accent live as data attributes on <html>; every color in the app is
// a CSS variable keyed on them. A blanket CSS transition would pin stale
// var-driven colors in Chromium, so switches disable transitions for a frame
// and animate through the View Transitions API instead (smooth crossfade).
export function applyVisualPrefs(p: Prefs, animate = false): void {
  try {
    const el = document.documentElement;
    const apply = () => {
      el.classList.add("wl-notransition");
      el.dataset.wlTheme = p.theme;
      el.dataset.wlAccent = p.accent;
      el.classList.toggle("wl-reduce", p.reducedMotion);
      void el.offsetHeight; // flush styles with transitions off
      // rAF never fires in a hidden tab — keep a timeout fallback so the
      // class can't get stuck (removal is idempotent).
      const done = () => el.classList.remove("wl-notransition");
      requestAnimationFrame(done);
      setTimeout(done, 150);
    };
    const vt = (
      document as Document & {
        startViewTransition?: (cb: () => void) => void;
      }
    ).startViewTransition;
    const reduced =
      p.reducedMotion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (animate && vt && !reduced) {
      vt.call(document, apply);
    } else {
      apply();
    }
  } catch {}
}

export function usePrefs(): Prefs {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const sync = () => setState(getPrefs());
    sync();
    applyVisualPrefs(getPrefs());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return prefs;
}
