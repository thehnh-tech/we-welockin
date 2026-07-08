// Accent palettes (settings UI metadata). The actual colors applied to the
// page live in globals.css under [data-wl-accent="…"] — keep both in sync.

export type AccentDef = {
  key: string;
  label: string;
  swatch: string; // shown in the settings picker
};

export const ACCENTS: AccentDef[] = [
  { key: "red", label: "Red", swatch: "#e2483a" },
  { key: "terracotta", label: "Terracotta", swatch: "#e07856" },
  { key: "vert", label: "Green", swatch: "#54a078" },
  { key: "bleu", label: "Blue", swatch: "#5a7db8" },
  { key: "violet", label: "Purple", swatch: "#8a6b96" },
  { key: "sarcelle", label: "Teal", swatch: "#4f8a86" },
  { key: "ambre", label: "Amber", swatch: "#b08646" },
];
