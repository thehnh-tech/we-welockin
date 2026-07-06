"use client";

import { useEffect, useRef, useState } from "react";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { setPseudo } from "@/lib/cookies";
import { TINTS } from "@/lib/avatar";

// Small gear button + settings popover (charte: modale radius 20, ombre
// modale, toggles pilules — remplissage encre = activé).
type Props = {
  pseudo?: string | null;
  onPseudoChange?: (p: string) => void; // shown only when provided
};

function Toggle({
  on,
  label,
  hint,
  onChange,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-[11px] px-2 py-2 text-left hover:bg-sunken"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[12.5px] text-text3">{hint}</span>}
      </span>
      <span
        className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150"
        style={{ background: on ? "#1a1714" : "#e7e1d6" }}
        aria-hidden="true"
      >
        <span
          className="absolute top-[3px] h-4 w-4 rounded-full bg-surface shadow-xs transition-all duration-150 ease-wl"
          style={{ left: on ? 18 : 3 }}
        />
      </span>
    </button>
  );
}

export default function SettingsMenu({ pseudo, onPseudoChange }: Props) {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pseudo ?? "");
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setName(pseudo ?? "");
  }, [pseudo]);

  // Escape + outside click close the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const savePseudo = () => {
    const v = name.trim();
    if (!v || !onPseudoChange) return;
    setPseudo(v);
    onPseudoChange(v);
  };

  const setNotifications = (on: boolean) => {
    setPrefs({ notifications: on });
    if (
      on &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Réglages"
        aria-expanded={open}
        title="Réglages"
        className="wl-lift flex h-[34px] w-[34px] items-center justify-center rounded-[11px] border border-strong bg-surface text-ink2 shadow-xs hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Réglages de l'interface"
          className="absolute right-0 top-[42px] z-50 w-[300px] rounded-[20px] border border-hairline bg-surface p-4 shadow-modal animate-wl-rise"
        >
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
            Réglages
          </div>

          {onPseudoChange && (
            <div className="mb-4">
              <label
                htmlFor="wl-pseudo"
                className="mb-1.5 block text-sm font-semibold text-ink"
              >
                Ton pseudo
              </label>
              <div className="flex gap-2">
                <input
                  id="wl-pseudo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePseudo()}
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-[11px] border border-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
                <button
                  onClick={savePseudo}
                  disabled={!name.trim() || name.trim() === pseudo}
                  className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-surface disabled:bg-track"
                >
                  Ok
                </button>
              </div>
            </div>
          )}

          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-ink">
              Ta couleur
            </div>
            <div
              className="flex flex-wrap items-center gap-2"
              role="radiogroup"
              aria-label="Teinte de ton avatar"
            >
              <button
                role="radio"
                aria-checked={prefs.tint === ""}
                aria-label="Automatique"
                title="Automatique"
                onClick={() => setPrefs({ tint: "" })}
                className="flex h-7 w-7 items-center justify-center rounded-full border bg-sunken text-[11px] font-bold text-text2"
                style={{
                  borderColor:
                    prefs.tint === "" ? "#1a1714" : "rgba(26,23,20,.12)",
                  borderWidth: prefs.tint === "" ? 2 : 1,
                }}
              >
                A
              </button>
              {TINTS.map((t) => (
                <button
                  key={t.key}
                  role="radio"
                  aria-checked={prefs.tint === t.key}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => setPrefs({ tint: t.key })}
                  className="h-7 w-7 rounded-full border transition-transform duration-150 ease-wl hover:scale-110"
                  style={{
                    background: t.bg,
                    borderColor: prefs.tint === t.key ? "#1a1714" : t.fg,
                    borderWidth: prefs.tint === t.key ? 2 : 1,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 border-t border-line pt-2">
            <Toggle
              on={prefs.sound}
              label="Son de fin"
              hint="Carillon quand le timer se termine"
              onChange={(v) => setPrefs({ sound: v })}
            />
            <Toggle
              on={prefs.notifications}
              label="Notifications"
              hint="Alerte système en fin de session"
              onChange={setNotifications}
            />
            <Toggle
              on={prefs.reducedMotion}
              label="Animations réduites"
              hint="Désactive levées et transitions"
              onChange={(v) => setPrefs({ reducedMotion: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
