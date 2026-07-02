import { useEffect } from "react";
import { recordFocusSeconds } from "@/lib/stats";

const TICK_S = 5;

// Accumulates local focus time (home stats: today / streak / week) while the
// user is in a room with the tab visible.
export function useFocusRecorder(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        recordFocusSeconds(TICK_S);
      }
    }, TICK_S * 1000);
    return () => clearInterval(t);
  }, [active]);
}
