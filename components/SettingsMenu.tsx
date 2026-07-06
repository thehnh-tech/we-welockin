"use client";

import { useEffect, useRef, useState } from "react";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { setPseudo } from "@/lib/cookies";
import { TINTS } from "@/lib/avatar";
import { ACCENTS } from "@/lib/theme";

// Gear button + settings panel. Every option applies live (theme, accent and
// timer restyle instantly) — the panel is the customization hub.
type Props = {
  pseudo?: string | null;
  onPseudoChange?: (p: string) => void; // shown only when provided
  tone?: "surface" | "band"; // button styling on paper vs on the ink band
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[.06em] text-text3 first:mt-0">
      {children}
    </div>
  );
}

function PillChoice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="flex gap-1.5 rounded-full bg-sunken p-1"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                const i = options.findIndex((x) => x.key === value);
                const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                const next = options[(i + dir + options.length) % options.length];
                onChange(next.key);
              }
            }}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 ease-wl ${
              selected
                ? "bg-ink text-surface shadow-xs"
                : "text-text2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
      className="flex w-full items-center justify-between gap-3 rounded-[11px] px-2 py-2 text-left transition-colors duration-150 hover:bg-sunken"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[12.5px] text-text3">{hint}</span>}
      </span>
      <span
        className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-wl"
        style={{ background: on ? "var(--wl-ink)" : "var(--wl-track)" }}
        aria-hidden="true"
      >
        <span
          className="absolute top-[3px] h-4 w-4 rounded-full shadow-xs transition-all duration-200 ease-wl"
          style={{ left: on ? 18 : 3, background: "var(--wl-surface)" }}
        />
      </span>
    </button>
  );
}

export default function SettingsMenu({ pseudo, onPseudoChange, tone = "surface" }: Props) {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pseudo ?? "");
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setName(pseudo ?? "");
  }, [pseudo]);

  // Move focus into the dialog when it opens (screen readers announce it).
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

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

  const btnClass =
    tone === "band"
      ? "border-bandline bg-bandchip text-bandtext2 hover:text-bandtext"
      : "border-strong bg-surface text-ink2 shadow-xs hover:text-ink";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Réglages"
        aria-expanded={open}
        title="Réglages"
        className={`wl-lift flex h-[34px] w-[34px] items-center justify-center rounded-[11px] border ${btnClass}`}
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
          tabIndex={-1}
          className="absolute right-0 top-[42px] z-50 max-h-[min(78vh,560px)] w-[320px] overflow-y-auto rounded-[20px] border border-hairline bg-surface p-4 shadow-modal outline-none animate-wl-rise"
        >
          <SectionLabel>Apparence</SectionLabel>
          <PillChoice
            label="Thème"
            value={prefs.theme}
            options={[
              { key: "papier" as const, label: "Papier" },
              { key: "encre" as const, label: "Encre" },
            ]}
            onChange={(v) => setPrefs({ theme: v })}
          />
          <div
            className="mt-2.5 flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Couleur d'accent"
          >
            {ACCENTS.map((a) => {
              const selected = prefs.accent === a.key;
              return (
                <button
                  key={a.key}
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Accent ${a.label}`}
                  title={a.label}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setPrefs({ accent: a.key })}
                  onKeyDown={(e) => {
                    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
                      e.preventDefault();
                      const i = ACCENTS.findIndex((x) => x.key === prefs.accent);
                      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                      const next = ACCENTS[(i + dir + ACCENTS.length) % ACCENTS.length];
                      setPrefs({ accent: next.key });
                      const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
                      radios?.[ACCENTS.indexOf(next)]?.focus();
                    }
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 ease-wl hover:scale-110"
                  style={{
                    background: a.swatch,
                    boxShadow: selected
                      ? "0 0 0 2px var(--wl-surface), 0 0 0 4px var(--wl-ink)"
                      : "none",
                  }}
                >
                  {selected && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fffefb"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          <SectionLabel>Timer</SectionLabel>
          <PillChoice
            label="Style du timer"
            value={prefs.timerStyle}
            options={[
              { key: "anneau" as const, label: "Anneau" },
              { key: "minimal" as const, label: "Minimal" },
            ]}
            onChange={(v) => setPrefs({ timerStyle: v })}
          />
          <div className="mt-1.5">
            <Toggle
              on={prefs.timerSeconds}
              label="Afficher les secondes"
              hint="Sinon, minutes arrondies (dernière minute en secondes)"
              onChange={(v) => setPrefs({ timerSeconds: v })}
            />
          </div>

          <SectionLabel>Profil</SectionLabel>
          {onPseudoChange && (
            <div className="mb-2.5">
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
                  className="min-w-0 flex-1 rounded-[11px] border border-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accentink"
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
          <div className="mb-1.5 text-sm font-semibold text-ink">Ta couleur</div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Teinte de ton avatar"
            onKeyDown={(e) => {
              // Roving radio pattern: arrows move + select.
              const keys = ["", ...TINTS.map((t) => t.key)];
              const i = keys.indexOf(prefs.tint);
              let next: number | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown")
                next = (i + 1) % keys.length;
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                next = (i - 1 + keys.length) % keys.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = keys.length - 1;
              if (next === null) return;
              e.preventDefault();
              setPrefs({ tint: keys[next] });
              const radios =
                e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
              radios[next]?.focus();
            }}
          >
            <button
              role="radio"
              aria-checked={prefs.tint === ""}
              aria-label="Automatique"
              title="Automatique"
              tabIndex={prefs.tint === "" ? 0 : -1}
              onClick={() => setPrefs({ tint: "" })}
              className="flex h-7 w-7 items-center justify-center rounded-full border bg-sunken text-[11px] font-bold text-text2"
              style={{
                borderColor:
                  prefs.tint === "" ? "var(--wl-ink)" : "var(--wl-strong)",
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
                tabIndex={prefs.tint === t.key ? 0 : -1}
                onClick={() => setPrefs({ tint: t.key })}
                className="flex h-7 w-7 items-center justify-center rounded-full border transition-transform duration-200 ease-wl hover:scale-110"
                style={{
                  background: t.bg,
                  borderColor: prefs.tint === t.key ? "var(--wl-ink)" : t.fg,
                  borderWidth: prefs.tint === t.key ? 2 : 1,
                }}
              >
                {prefs.tint === t.key && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1a1714"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <SectionLabel>Alertes</SectionLabel>
          <div className="flex flex-col gap-0.5">
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
