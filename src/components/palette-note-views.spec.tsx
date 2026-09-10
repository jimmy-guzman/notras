import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  DeleteView,
  MoveView,
  TagsView,
} from "@/components/palette-note-views";
import { Command, CommandList } from "@/components/ui/command";

function mount(view: ReactNode) {
  return render(
    createElement(
      Command,
      { label: "note action", shouldFilter: false },
      createElement(CommandList, null, view)
    )
  );
}

describe("palette note views", () => {
  it("should select the matching existing folder without offering root or a duplicate new folder", async () => {
    const user = userEvent.setup();
    const moved: string[] = [];
    const { container: host } = mount(
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
    expect(host.textContent).not.toContain("notes root");
    expect(host.textContent).not.toContain("new folder");
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toContain("Client Work");
    await user.click(selected);
    expect(moved).toEqual(["Client Work"]);
  });

  it("should expose tag attachment independently of keyboard selection", async () => {
    const user = userEvent.setup();
    const toggled: [string, boolean][] = [];
    mount(
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
    const attached = screen.getByRole("option", { name: "work 2" });
    expect(attached.textContent).toContain("work");
    expect(attached).toHaveAttribute("aria-selected", "false");
    expect(attached).toHaveAttribute("aria-checked", "true");
    await user.click(attached);
    expect(toggled).toEqual([["work", true]]);
  });

  it("should default deletion confirmation to cancel", async () => {
    const user = userEvent.setup();
    const actions: string[] = [];
    mount(
      createElement(DeleteView, {
        onCancel: () => actions.push("cancel"),
        onConfirm: () => actions.push("delete"),
        title: "Atlas",
      })
    );
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toBe("cancel");
    await user.click(selected);
    expect(actions).toEqual(["cancel"]);
  });
});
