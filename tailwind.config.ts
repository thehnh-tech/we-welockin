import type { Config } from "tailwindcss";

// Palette from the WeLockIn UI mockup. Grays/indigo not listed here use the
// standard Tailwind scale (zinc-*, indigo-*, green-500, red-400, amber-*).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#161618", // page background
        panel: "#1b1b1e", // cards / sidebar
        panel2: "#222226", // remote tiles
        tile: "#1f1f23", // own tile
        line: "#26262a", // subtle borders
        line2: "#2f2f34", // stronger borders (inputs, buttons)
        accent: "#6366f1", // indigo-500 alias, kept for existing classes
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "wl-live": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
        "wl-breathe": {
          "0%,100%": { transform: "scale(1)", opacity: ".45" },
          "50%": { transform: "scale(1.08)", opacity: ".8" },
        },
        "wl-eq": {
          "0%,100%": { height: "5px" },
          "50%": { height: "15px" },
        },
      },
      animation: {
        "wl-live": "wl-live 1.6s ease-in-out infinite",
        "wl-breathe": "wl-breathe 5s ease-in-out infinite",
        "wl-eq": "wl-eq .8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
