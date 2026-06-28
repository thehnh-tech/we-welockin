// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPseudo, getPseudo, setPseudo } from "./cookies";

beforeEach(() => {
  clearPseudo();
});

describe("pseudo cookie", () => {
  it("round-trips a value", () => {
    setPseudo("Hedi");
    expect(getPseudo()).toBe("Hedi");
  });

  it("trims and truncates to 30 chars", () => {
    setPseudo("  " + "n".repeat(40) + "  ");
    expect(getPseudo()).toBe("n".repeat(30));
  });

  it("survives values needing URL encoding", () => {
    setPseudo("Jean Dupont & co");
    expect(getPseudo()).toBe("Jean Dupont & co");
  });

  it("returns null after clear", () => {
    setPseudo("X");
    clearPseudo();
    expect(getPseudo()).toBeNull();
  });
});
