// The welock.in blocker promo — the copy it shows, the language it shows it
// in, and where its links land. Pure (no DOM) so the rules are unit-tested;
// components/BlockerBanner.tsx only renders what this module decides.

// The languages welock.in itself publishes (its hreflang set), in the site's
// own tags. Anything else falls back to English — the site's x-default — so
// the promo never speaks a language its landing page cannot answer in.
export const BLOCKER_LOCALES = ["en", "fr", "es", "de", "pt-BR", "hi"] as const;
export type BlockerLocale = (typeof BLOCKER_LOCALES)[number];

// welock.in's canonical origin. The apex (welock.in) answers with a 308 to
// www, so linking straight to the canonical spares every visitor that hop
// and hands the referral to the URL search engines already credit.
// Overridable for staging (NEXT_PUBLIC_*: inlined at build time, so readable
// from the client component).
export const BLOCKER_ORIGIN = (
  process.env.NEXT_PUBLIC_BLOCKER_URL || "https://www.welock.in"
).replace(/\/$/, "");

// Where each language lives on the site ("" = the English root).
const LOCALE_PATH: Record<BlockerLocale, string> = {
  en: "",
  fr: "/fr",
  es: "/es",
  de: "/de",
  "pt-BR": "/pt-br",
  hi: "/hi",
};

/**
 * The language to show the promo in, from the browser's preference list
 * (navigator.languages, most preferred first). Per entry, the exact tag wins
 * ("pt-BR"), then the language family ("fr-CH" → fr; "pt-PT" → pt-BR, the
 * one Portuguese the site has). The first entry that matches anything
 * decides, so ["en-US", "fr"] stays English. Nothing matching → English.
 */
export function pickBlockerLocale(
  languages: readonly string[]
): BlockerLocale {
  for (const raw of languages) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    const exact = BLOCKER_LOCALES.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const family = tag.split("-")[0];
    const sibling = BLOCKER_LOCALES.find(
      (l) => l.split("-")[0].toLowerCase() === family
    );
    if (sibling) return sibling;
  }
  return "en";
}

export type BlockerPlacement = "sidebar" | "banner" | "bubble";
export type BlockerPage = "home" | "download";

/**
 * A landing URL: the page in the reader's language (a French reader lands on
 * /fr, not on an English page that then has to guess), plus UTM tags so
 * welock.in's analytics can tell the placements apart. The site's canonical
 * tag folds the tagged URL back into the plain one for search engines.
 */
export function blockerUrl(
  locale: BlockerLocale,
  page: BlockerPage,
  placement: BlockerPlacement,
  origin: string = BLOCKER_ORIGIN
): string {
  const path =
    LOCALE_PATH[locale] + (page === "download" ? "/download" : "") || "/";
  const utm = new URLSearchParams({
    utm_source: "welockin-study",
    utm_medium: "referral",
    utm_campaign: "blocker",
    utm_content: placement,
  });
  return `${origin}${path}?${utm.toString()}`;
}

export type BlockerStrings = {
  /** Name of the landmark, for assistive tech. */
  label: string;
  /** Bubble, folded: the two lines on the pill. */
  pillTitle: string;
  pillSub: string;
  /** Card and banner. */
  headline: string;
  /** Card. */
  bullets: readonly [string, string];
  /** Banner. */
  subline: string;
  /** Card CTA (→ the download page). */
  download: string;
  /** Banner CTA (→ the download page). */
  start: string;
  /** Card: gone for the session. */
  notNow: string;
  /** Close buttons (icon-only). */
  close: string;
};

// Copy in each language, in the voice welock.in uses on its own localized
// pages (informal "du" in German, "você" in Brazilian Portuguese, "आप" in
// Hindi; "session", "Sperre", "trava"…). Platform names stay as they are.
export const BLOCKER_STRINGS: Record<BlockerLocale, BlockerStrings> = {
  en: {
    label: "welock.in app blocker",
    pillTitle: "Too distracted?",
    pillSub: "Block it in one tap",
    headline: "Link every device. They all lock at the same time.",
    bullets: [
      "Apps, sites and notifications at once",
      "Mac, PC, iPhone and iPad together",
    ],
    subline:
      "Five difficulty levels, up to a lock nothing lifts before the date you set.",
    download: "Download free",
    start: "Start a session",
    notNow: "Not now",
    close: "Close",
  },
  fr: {
    label: "Bloqueur d'applis welock.in",
    pillTitle: "Trop de distractions ?",
    pillSub: "Bloquez-les d'un geste",
    headline: "Reliez tous vos appareils. Ils se verrouillent en même temps.",
    bullets: [
      "Applis, sites et notifications d'un coup",
      "Mac, PC, iPhone et iPad ensemble",
    ],
    subline:
      "Cinq niveaux de sévérité, jusqu'au verrou que rien ne lève avant la date que vous fixez.",
    download: "Télécharger gratuitement",
    start: "Lancer une session",
    notNow: "Pas maintenant",
    close: "Fermer",
  },
  es: {
    label: "Bloqueador de apps welock.in",
    pillTitle: "¿Demasiadas distracciones?",
    pillSub: "Bloquéalas con un toque",
    headline: "Conecta todos tus dispositivos. Se bloquean a la vez.",
    bullets: [
      "Apps, sitios y notificaciones de una vez",
      "Mac, PC, iPhone y iPad juntos",
    ],
    subline:
      "Cinco niveles de dureza, hasta un bloqueo que nada quita antes de la fecha que fijes.",
    download: "Descargar gratis",
    start: "Empezar una sesión",
    notNow: "Ahora no",
    close: "Cerrar",
  },
  de: {
    label: "welock.in App-Blocker",
    pillTitle: "Zu abgelenkt?",
    pillSub: "Mit einem Tipp sperren",
    headline: "Verbinde alle deine Geräte. Sie sperren sich gleichzeitig.",
    bullets: [
      "Apps, Websites und Benachrichtigungen auf einmal",
      "Mac, PC, iPhone und iPad zusammen",
    ],
    subline:
      "Fünf Schwierigkeitsstufen, bis zur Sperre, die vor deinem Datum nichts aufhebt.",
    download: "Kostenlos herunterladen",
    start: "Session starten",
    notNow: "Jetzt nicht",
    close: "Schließen",
  },
  "pt-BR": {
    label: "Bloqueador de apps welock.in",
    pillTitle: "Muitas distrações?",
    pillSub: "Bloqueie tudo com um toque",
    headline: "Conecte todos os seus aparelhos. Eles travam ao mesmo tempo.",
    bullets: [
      "Apps, sites e notificações de uma vez",
      "Mac, PC, iPhone e iPad juntos",
    ],
    subline:
      "Cinco níveis de rigor, até uma trava que nada libera antes da data que você definir.",
    download: "Baixar grátis",
    start: "Começar uma sessão",
    notNow: "Agora não",
    close: "Fechar",
  },
  hi: {
    label: "welock.in ऐप ब्लॉकर",
    pillTitle: "ध्यान भटक रहा है?",
    pillSub: "एक टैप में ब्लॉक करें",
    headline: "हर डिवाइस जोड़ें। सब एक साथ लॉक हो जाते हैं।",
    bullets: [
      "ऐप्स, साइटें और नोटिफ़िकेशन एक साथ",
      "Mac, PC, iPhone और iPad एक साथ",
    ],
    subline:
      "लॉक के पाँच स्तर, यहाँ तक कि ऐसा लॉक जो आपकी तय तारीख़ से पहले किसी से नहीं खुलता।",
    download: "मुफ़्त डाउनलोड करें",
    start: "सेशन शुरू करें",
    notNow: "अभी नहीं",
    close: "बंद करें",
  },
};

export type BlockerSidebarStrings = {
  /** Headline in three runs; the middle one sits on the highlight. */
  headline: readonly [string, string, string];
  bullets: readonly [string, string, string];
  cta: string;
  /** Label of a review dot; {n} is the review's number. */
  showReview: string;
};

// The sidebar unit's own copy. The reviews under it come from
// lib/blockerReviews, in the site's own translations.
export const BLOCKER_SIDEBAR: Record<BlockerLocale, BlockerSidebarStrings> = {
  en: {
    headline: ["Stop scrolling ", "in one tap,", " not one day"],
    bullets: [
      "Apps, sites and notifications, blocked at once",
      "Every linked device locks together",
      "Nuclear Mode holds until the date you set",
    ],
    cta: "Get Welockin free",
    showReview: "Show review {n}",
  },
  fr: {
    headline: ["Arrêtez de scroller ", "d'un geste,", " pas « un jour »"],
    bullets: [
      "Applis, sites et notifications, bloqués d'un coup",
      "Tous vos appareils reliés se verrouillent ensemble",
      "Le verrou nucléaire tient jusqu'à la date que vous fixez",
    ],
    cta: "Obtenir Welockin gratuitement",
    showReview: "Afficher l'avis {n}",
  },
  es: {
    headline: ["Deja de hacer scroll ", "con un toque,", " no «algún día»"],
    bullets: [
      "Apps, sitios y notificaciones, bloqueados a la vez",
      "Todos tus dispositivos vinculados se bloquean juntos",
      "El bloqueo Nuclear aguanta hasta la fecha que fijes",
    ],
    cta: "Consigue Welockin gratis",
    showReview: "Mostrar la reseña {n}",
  },
  de: {
    headline: ["Schluss mit Scrollen ", "mit einem Tipp,", " nicht „irgendwann“"],
    bullets: [
      "Apps, Websites und Benachrichtigungen, auf einmal gesperrt",
      "Alle verbundenen Geräte sperren sich zusammen",
      "Die nukleare Sperre hält bis zu deinem Datum",
    ],
    cta: "Welockin kostenlos holen",
    showReview: "Bewertung {n} anzeigen",
  },
  "pt-BR": {
    headline: ["Pare de rolar a tela ", "com um toque,", " não “um dia”"],
    bullets: [
      "Apps, sites e notificações, bloqueados de uma vez",
      "Todos os aparelhos conectados travam juntos",
      "A trava Nuclear segura até a data que você definir",
    ],
    cta: "Baixe o Welockin grátis",
    showReview: "Mostrar a avaliação {n}",
  },
  hi: {
    headline: ["स्क्रॉल करना बंद करें ", "एक टैप में,", " “किसी दिन” नहीं"],
    bullets: [
      "ऐप्स, साइटें और नोटिफ़िकेशन, एक साथ ब्लॉक",
      "जुड़े सभी डिवाइस एक साथ लॉक होते हैं",
      "न्यूक्लियर लॉक आपकी तय तारीख़ तक टिका रहता है",
    ],
    cta: "Welockin मुफ़्त पाएँ",
    showReview: "समीक्षा {n} दिखाएँ",
  },
};
