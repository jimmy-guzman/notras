import {
  act,
  createElement,
  StrictMode,
  Suspense,
  startTransition,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";

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
 * from a child, as the palette reads bindings registered by the routes.
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

function pressShortcut(key: string) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key })
  );
  document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key }));
}

interface BindingProps {
  enabled: boolean;
  name: string;
  onRun: (name: string) => void;
}

function LiveBindings({ enabled, name, onRun }: BindingProps) {
  useHotkey("Control+S", () => onRun(name), { enabled, meta: { name } });
  useHotkeys([
    {
      callback: () => onRun(name),
      hotkey: "Control+O",
      options: { enabled, meta: { name } },
    },
  ]);
  return null;
}

function ChordReader() {
  const chords = useChordsByName();
  return createElement(
    "output",
    null,
    [...chords]
      .map(
        ([name, registrations]) =>
          `${name}: ${registrations.map(({ hotkey }) => hotkey).join(", ")}`
      )
      .join("; ")
  );
}

describe("shortcut registration lifecycle", () => {
  it("should update live chord labels and callbacks without updating another component during render", async ({
    onTestFinished,
  }) => {
    const warnings = vi.spyOn(console, "error").mockImplementation(NOOP);
    onTestFinished(() => warnings.mockRestore());
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    const calls: string[] = [];
    const run = (name: string) => {
      calls.push(name);
    };
    const render = async (name: string, enabled: boolean) => {
      await act(async () => {
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(LiveBindings, { enabled, name, onRun: run }),
            createElement(ChordReader)
          )
        );
        await Promise.resolve();
      });
    };
    await render("first", true);
    expect(host.textContent).toContain("first: Mod+S, Mod+O");
    act(() => {
      pressShortcut("s");
      pressShortcut("o");
    });
    await render("second", false);
    expect(host.textContent).toContain("second: Mod+S, Mod+O");
    expect(host.textContent).not.toContain("first");
    act(() => {
      pressShortcut("s");
      pressShortcut("o");
    });
    expect(calls).toEqual(["first", "first"]);
    await render("third", true);
    act(() => {
      pressShortcut("s");
      pressShortcut("o");
    });
    expect(calls).toEqual(["first", "first", "third", "third"]);
    expect(warnings).not.toHaveBeenCalled();
    await act(async () => {
      root.render(createElement(ChordReader));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("");
    act(() => {
      pressShortcut("s");
      pressShortcut("o");
    });
    expect(calls).toHaveLength(4);
  });

  it("should keep the committed callbacks and options while a replacement render is suspended", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    const pending = Promise.withResolvers<void>();
    const calls: string[] = [];
    function SuspendingBindings({ suspend }: { suspend: boolean }) {
      const name = suspend ? "pending" : "committed";
      useHotkey(
        "Control+S",
        () => {
          calls.push(name);
        },
        { enabled: true }
      );
      useHotkeys([
        {
          callback: () => {
            calls.push(name);
          },
          hotkey: "Control+O",
          options: { enabled: !suspend },
        },
      ]);
      if (suspend) {
        throw pending.promise;
      }
      return createElement("span", null, name);
    }
    await act(async () => {
      root.render(
        createElement(
          Suspense,
          { fallback: "loading" },
          createElement(SuspendingBindings, { suspend: false })
        )
      );
      await Promise.resolve();
    });
    await act(async () => {
      startTransition(() => {
        root.render(
          createElement(
            Suspense,
            { fallback: "loading" },
            createElement(SuspendingBindings, { suspend: true })
          )
        );
      });
      await Promise.resolve();
    });
    expect(host.textContent).toBe("committed");
    act(() => {
      pressShortcut("s");
      pressShortcut("o");
    });
    expect(calls).toEqual(["committed", "committed"]);
  });
});

describe("shortcut ownership", () => {
  it("should let a component register shortcuts and read its own live labels", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    const calls: string[] = [];
    function Owner({ name }: { name: string }) {
      useHotkey(
        "Mod+S",
        () => {
          calls.push(name);
        },
        { meta: { name } }
      );
      const chords = useChordsByName();
      return createElement("output", null, [...chords.keys()].join(", "));
    }
    await act(async () => {
      root.render(createElement(Owner, { name: "save" }));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("save");
    await act(async () => {
      root.render(createElement(Owner, { name: "save capture" }));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("save capture");
    act(() => pressShortcut("s"));
    expect(calls).toEqual(["save capture"]);
  });

  it("should remove replaced list bindings and dispatch each current binding once", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    const calls: string[] = [];
    function Owner({ changed }: { changed: boolean }) {
      useHotkeys(
        changed
          ? [
              {
                callback: () => {
                  calls.push("new second");
                },
                hotkey: "Mod+2",
              },
              {
                callback: () => {
                  calls.push("third");
                },
                hotkey: "Mod+3",
              },
            ]
          : [
              {
                callback: () => {
                  calls.push("first");
                },
                hotkey: "Mod+1",
              },
              {
                callback: () => {
                  calls.push("second");
                },
                hotkey: "Mod+2",
              },
            ],
        { meta: { name: "switch tab" } }
      );
      return createElement(ChordReader);
    }
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(Owner, { changed: false })
        )
      );
      await Promise.resolve();
    });
    act(() => {
      pressShortcut("1");
      pressShortcut("2");
    });
    await act(async () => {
      root.render(
        createElement(StrictMode, null, createElement(Owner, { changed: true }))
      );
      await Promise.resolve();
    });
    expect(host.textContent).toBe("switch tab: Mod+2, Mod+3");
    act(() => {
      pressShortcut("1");
      pressShortcut("2");
      pressShortcut("3");
    });
    expect(calls).toEqual(["first", "second", "new second", "third"]);
  });
});
