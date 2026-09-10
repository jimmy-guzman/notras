import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createElement,
  Fragment,
  type PropsWithChildren,
  Suspense,
  startTransition,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";
import { chordGlyph, useChordsByName } from "./shortcuts";

const NOOP = () => undefined;

function RegisteredBindings({ children }: PropsWithChildren) {
  useHotkeys(
    [
      { callback: NOOP, hotkey: "Mod+N" },
      { callback: NOOP, hotkey: "Mod+T" },
    ],
    { meta: { name: "new note" } }
  );
  useHotkey("Mod+W", NOOP);
  return children;
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

describe("chord glyph", () => {
  it("should separate the segments the platform needs a separator for", () => {
    // happy-dom does not report macOS, so this exercises the word-label branch.
    expect(chordGlyph("Mod+Shift+K")).toBe("ctrl+shift+k");
  });
  it("should print a single key with no separator", () => {
    expect(chordGlyph("Escape")).toBe("esc");
  });
});

describe("chords by name", () => {
  it("should collect every chord registered under one name", () => {
    const { result } = renderHook(() => useChordsByName(), {
      wrapper: RegisteredBindings,
    });
    expect(
      result.current.get("new note")?.map(({ hotkey }) => hotkey)
    ).toStrictEqual(["Mod+N", "Mod+T"]);
  });
  it("should leave a name nothing registered absent", () => {
    const { result } = renderHook(() => useChordsByName(), {
      wrapper: RegisteredBindings,
    });
    expect(result.current.get("close tab")).toBeUndefined();
  });
});

describe("shortcut registration lifecycle", () => {
  it("should update live chord labels and callbacks without updating another component during render", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const warnings = vi.spyOn(console, "error").mockImplementation(NOOP);
    onTestFinished(() => warnings.mockRestore());
    const calls: string[] = [];
    const bindings = (name: string, enabled: boolean) =>
      createElement(
        Fragment,
        null,
        createElement(LiveBindings, {
          enabled,
          name,
          onRun: (value) => calls.push(value),
        }),
        createElement(ChordReader)
      );
    const { rerender } = render(bindings("first", true), {
      reactStrictMode: true,
    });
    expect(screen.getByRole("status")).toHaveTextContent("first: Mod+S, Mod+O");
    await user.keyboard("{Control>}so{/Control}");
    rerender(bindings("second", false));
    expect(screen.getByRole("status")).toHaveTextContent(
      "second: Mod+S, Mod+O"
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("first");
    await user.keyboard("{Control>}so{/Control}");
    expect(calls).toEqual(["first", "first"]);
    rerender(bindings("third", true));
    await user.keyboard("{Control>}so{/Control}");
    expect(calls).toEqual(["first", "first", "third", "third"]);
    expect(warnings).not.toHaveBeenCalled();
    rerender(createElement(ChordReader));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.keyboard("{Control>}so{/Control}");
    expect(calls).toHaveLength(4);
  });

  it("should keep the committed callbacks and options while a replacement render is suspended", async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<void>();
    const calls: string[] = [];
    function SuspendingBindings({ suspend }: { suspend: boolean }) {
      const name = suspend ? "pending" : "committed";
      useHotkey("Control+S", () => calls.push(name), { enabled: true });
      useHotkeys([
        {
          callback: () => calls.push(name),
          hotkey: "Control+O",
          options: { enabled: !suspend },
        },
      ]);
      if (suspend) {
        throw pending.promise;
      }
      return createElement("span", null, name);
    }
    const { container, rerender } = render(
      createElement(
        Suspense,
        { fallback: "loading" },
        createElement(SuspendingBindings, { suspend: false })
      )
    );
    await act(() => {
      startTransition(() =>
        rerender(
          createElement(
            Suspense,
            { fallback: "loading" },
            createElement(SuspendingBindings, { suspend: true })
          )
        )
      );
    });
    expect(container.textContent).toBe("committed");
    await user.keyboard("{Control>}so{/Control}");
    expect(calls).toEqual(["committed", "committed"]);
  });
});

describe("shortcut ownership", () => {
  it("should let a component register shortcuts and read its own live labels", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    function Owner({ name }: { name: string }) {
      useHotkey("Mod+S", () => calls.push(name), { meta: { name } });
      const chords = useChordsByName();
      return createElement("output", null, [...chords.keys()].join(", "));
    }
    const { rerender } = render(createElement(Owner, { name: "save" }));
    expect(screen.getByRole("status").textContent).toBe("save");
    rerender(createElement(Owner, { name: "save capture" }));
    expect(screen.getByRole("status").textContent).toBe("save capture");
    await user.keyboard("{Control>}s{/Control}");
    expect(calls).toEqual(["save capture"]);
  });

  it("should remove replaced list bindings and dispatch each current binding once", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    function Owner({ changed }: { changed: boolean }) {
      useHotkeys(
        changed
          ? [
              { callback: () => calls.push("new second"), hotkey: "Mod+2" },
              { callback: () => calls.push("third"), hotkey: "Mod+3" },
            ]
          : [
              { callback: () => calls.push("first"), hotkey: "Mod+1" },
              { callback: () => calls.push("second"), hotkey: "Mod+2" },
            ],
        { meta: { name: "switch tab" } }
      );
      return createElement(ChordReader);
    }
    const { rerender } = render(createElement(Owner, { changed: false }), {
      reactStrictMode: true,
    });
    await user.keyboard("{Control>}12{/Control}");
    rerender(createElement(Owner, { changed: true }));
    expect(screen.getByRole("status").textContent).toBe(
      "switch tab: Mod+2, Mod+3"
    );
    await user.keyboard("{Control>}123{/Control}");
    expect(calls).toEqual(["first", "second", "new second", "third"]);
  });
});
