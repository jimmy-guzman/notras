import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { chordGlyph, useChordsByName } from "./shortcuts";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const NOOP = () => undefined;

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

/**
 * Registers a named pair and a nameless binding, then reads the lookup back
 * from a child. Reading it in the registering component would never settle,
 * which is also how the app is arranged: the palette reads, the routes
 * register.
 */
const mountLookup = async () => {
  // A plain `let` assigned only inside the child narrows to `never` at the
  // read below, since the compiler cannot see the closure write.
  const captured: { value: ReturnType<typeof useChordsByName> | null } = {
    value: null,
  };

  function Reader() {
    captured.value = useChordsByName();

    return null;
  }

  function Fixture() {
    useHotkeys(
      [
        { callback: NOOP, hotkey: "Mod+N" },
        { callback: NOOP, hotkey: "Mod+T" },
      ],
      { meta: { name: "new note" } }
    );
    useHotkey("Mod+W", NOOP);

    return createElement(Reader);
  }

  const host = document.createElement("div");

  document.body.append(host);

  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(Fixture));
    await Promise.resolve();
  });

  teardown = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };

  const { value } = captured;

  if (value === null) {
    throw new Error("the lookup never rendered");
  }

  return value;
};

describe("chord glyph", () => {
  it("should separate the segments the platform needs a separator for", () => {
    // happy-dom does not report macOS, so this is the word-label branch, where
    // dropping the separator would read `ctrlshiftk`.
    expect(chordGlyph("Mod+Shift+K")).toBe("ctrl+shift+k");
  });

  it("should print a single key with no separator", () => {
    expect(chordGlyph("Escape")).toBe("esc");
  });
});

describe("chords by name", () => {
  it("should collect every chord registered under one name", async () => {
    const chords = await mountLookup();

    expect(chords.get("new note")?.map(({ hotkey }) => hotkey)).toStrictEqual([
      "Mod+N",
      "Mod+T",
    ]);
  });

  it("should leave a name nothing registered absent", async () => {
    const chords = await mountLookup();

    expect(chords.get("close tab")).toBeUndefined();
  });
});
