import type { Config } from "tailwindcss";

// All colors resolve to CSS variables (see app/globals.css) so the theme and
// accent switch live from the settings panel.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--wl-canvas)",
        surface: "var(--wl-surface)",
        card: "var(--wl-card)",
        cardalt: "var(--wl-cardalt)",
        sunken: "var(--wl-sunken)",
        track: "var(--wl-track)",

        ink: "var(--wl-ink)",
        ink2: "var(--wl-ink2)",
        text2: "var(--wl-text2)",
        text3: "var(--wl-text3)",
        muted: "var(--wl-muted)",
        faint: "var(--wl-faint)",
        placeholder: "var(--wl-placeholder)",

        accent: "var(--wl-accent)",
        accentink: "var(--wl-accent-strong)",
        accenttint: "var(--wl-accent-tint)",

        danger: "var(--wl-danger)",
        dangertint: "var(--wl-danger-tint)",

        // Ink band — sidebar and page-top zone
        band: "var(--wl-band)",
        band2: "var(--wl-band-2)",
        bandtext: "var(--wl-band-text)",
        bandtext2: "var(--wl-band-text2)",
        bandtext3: "var(--wl-band-text3)",
        bandchip: "var(--wl-band-chip)",
        bandactive: "var(--wl-band-active)",
        bandactivetext: "var(--wl-band-active-text)",
      },
      borderColor: {
        hairline: "var(--wl-hairline)",
        line: "var(--wl-line)",
        strong: "var(--wl-strong)",
        bandline: "var(--wl-band-line)",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(var(--wl-shadow-color), .05)",
        sm: "0 2px 8px rgba(var(--wl-shadow-color), .07)",
        md: "0 4px 16px rgba(var(--wl-shadow-color), .09)",
        lg: "0 8px 24px rgba(var(--wl-shadow-color), .14)",
        modal: "0 30px 80px rgba(var(--wl-shadow-color), .22)",
      },
      fontFamily: {
        sans: ["var(--font-figtree)", "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        wl: "cubic-bezier(.2, .8, .3, 1)",
      },
      keyframes: {
        "wl-live": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
        "wl-eq": {
          "0%,100%": { height: "5px" },
          "50%": { height: "15px" },
        },
        "wl-rise": {
          from: { opacity: "0", transform: "translateY(9px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "wl-toast": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Blocker promo: the card popping out of its pill, the bar sliding up.
        "wl-pop": {
          from: { opacity: "0", transform: "translateY(10px) scale(.97)" },
          to: { opacity: "1", transform: "none" },
        },
        "wl-up": {
          from: { opacity: "0", transform: "translateY(100%)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "wl-live": "wl-live 1.6s ease-in-out infinite",
        "wl-eq": "wl-eq .8s ease-in-out infinite",
        "wl-rise": "wl-rise .3s cubic-bezier(.2,.8,.3,1) both",
        "wl-toast": "wl-toast .25s cubic-bezier(.2,.8,.3,1) both",
        "wl-pop": "wl-pop .28s cubic-bezier(.2,.8,.2,1) both",
        "wl-up": "wl-up .42s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
