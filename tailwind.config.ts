import type { Config } from "tailwindcss";

// Design tokens from "Charte graphique welock v1.0" — warm paper surfaces,
// brown inks, sparing terracotta accent. No pure white, no cold grays.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces papier
        canvas: "#efeae0", // fond d'app
        surface: "#fffefb", // panneau
        card: "#faf7f1", // carte
        cardalt: "#fcfaf6", // nav
        sunken: "#f2ede3", // puits
        track: "#e7e1d6", // piste
        // Encre & texte
        ink: "#1a1714", // texte primaire
        ink2: "#3a352d", // traits d'icônes
        text2: "#5b5448", // secondaire
        text3: "#7a7164", // tertiaire / légendes
        muted: "#8a8175", // désactivé
        faint: "#b3aa9b",
        placeholder: "#c4bbac",
        // Accent terracotta — un seul moment accentué par écran
        accent: "#e07856",
        accentink: "#c25a3a",
        accenttint: "#f5e4dd",
        // Destructif — brique
        danger: "#a42b1b",
        dangertint: "#f7e7e3",
      },
      borderColor: {
        hairline: "rgba(26,23,20,.06)",
        line: "rgba(26,23,20,.08)",
        strong: "rgba(26,23,20,.12)",
      },
      boxShadow: {
        // Ombres basses et chaudes — toujours en alpha d'encre
        xs: "0 1px 2px rgba(26,23,20,.04)",
        sm: "0 2px 8px rgba(26,23,20,.06)",
        md: "0 4px 16px rgba(26,23,20,.08)",
        lg: "0 8px 24px rgba(26,23,20,.12)",
        modal: "0 30px 80px rgba(26,23,20,.18)",
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
          from: { opacity: "0", transform: "translateY(7px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "wl-toast": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "wl-live": "wl-live 1.6s ease-in-out infinite",
        "wl-eq": "wl-eq .8s ease-in-out infinite",
        "wl-rise": "wl-rise .2s cubic-bezier(.2,.8,.3,1) both",
        "wl-toast": "wl-toast .2s cubic-bezier(.2,.8,.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
