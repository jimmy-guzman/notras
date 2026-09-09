import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  DeleteView,
  MoveView,
  TagsView,
} from "@/components/palette-note-views";
import { Command, CommandList } from "@/components/ui/command";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function mount(view: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(() => {
    root.render(
      createElement(
        Command,
        { label: "note action", shouldFilter: false },
        createElement(CommandList, null, view)
      )
    );
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("palette note views", () => {
  it("should select the matching existing folder without offering root or a duplicate new folder", async ({
    onTestFinished,
  }) => {
    const moved: string[] = [];
    const { host, unmount } = await mount(
      createElement(MoveView, {
        folders: [
          { count: 3, folder: "/" },
          { count: 2, folder: "Client Work" },
          { count: 1, folder: "Client Work/2026" },
        ],
        onCancel: () => undefined,
        onMove: (folder) => moved.push(folder),
        onMoveToNewFolder: () => moved.push("new"),
        query: "client work",
      })
    );
    onTestFinished(unmount);
    expect(host.textContent).not.toContain("notes root");
    expect(host.textContent).not.toContain("new folder");
    const selected = host.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]'
    );
    expect(selected?.textContent).toContain("Client Work");
    act(() => selected?.click());
    expect(moved).toEqual(["Client Work"]);
  });

  it("should expose tag attachment independently of keyboard selection", async ({
    onTestFinished,
  }) => {
    const toggled: [string, boolean][] = [];
    const { host, unmount } = await mount(
      createElement(TagsView, {
        attached: ["work"],
        choices: ["review", "work"],
        counts: new Map([["work", 2]]),
        draftTag: "",
        onCreate: () => undefined,
        onDone: () => undefined,
        onToggle: (tag, wasAttached) => toggled.push([tag, wasAttached]),
        title: "Atlas",
      })
    );
    onTestFinished(unmount);
    const attached = host.querySelector<HTMLElement>(
      '[role="option"][aria-checked="true"]'
    );
    expect(attached?.textContent).toContain("work");
    expect(attached?.getAttribute("aria-selected")).toBe("false");
    act(() => attached?.click());
    expect(toggled).toEqual([["work", true]]);
  });

  it("should default deletion confirmation to cancel", async ({
    onTestFinished,
  }) => {
    const actions: string[] = [];
    const { host, unmount } = await mount(
      createElement(DeleteView, {
        onCancel: () => actions.push("cancel"),
        onConfirm: () => actions.push("delete"),
        title: "Atlas",
      })
    );
    onTestFinished(unmount);
    const selected = host.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]'
    );
    expect(selected?.textContent).toBe("cancel");
    act(() => selected?.click());
    expect(actions).toEqual(["cancel"]);
  });
});
