import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
  ...next,
  {
    rules: {
      // These flag the legacy patterns in app/room/[id]/page.tsx (latest-value ref,
      // mount-time setState from cookie/URL). They are tracked for Phase 4 (extract
      // usePeerMesh/usePresence/useLocalMedia hooks); kept as warnings until then so
      // they stay visible without blocking the lint gate.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
