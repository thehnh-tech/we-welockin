import { useEffect, useState } from "react";

// True while the tab is hidden — broadcast as the "Absent" status so the crew
// sees who actually stepped away instead of a silent presence gap.
export function useAway(): boolean {
  const [away, setAway] = useState(false);

  useEffect(() => {
    const update = () => setAway(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return away;
}
