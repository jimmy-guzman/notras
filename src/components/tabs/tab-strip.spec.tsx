import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";

import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import { readRecentNotes } from "@/lib/recent-notes";
import {
  closeTab,
  getTabState,
  registerLoadedNote,
  registerTabSnapshot,
  restoreTabs,
} from "@/lib/tabs/store";
import type { TabSnapshot } from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { hideGraph, showGraph } from "@/lib/ui/graph";

async function mountStrip(tabs: Tab[]) {
  mockIPC((command) => {
    if (command === "get_notes_dir") {
      return "/notes";
    }

    if (command.startsWith("plugin:")) {
      return 0;
    }

    throw new Error(`unexpected command: ${command}`);
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const { container } = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <Titlebar>
          <TabStrip activeId={tabs[0]?.id ?? ""} tabs={tabs} />
        </Titlebar>
      </Suspense>
    </QueryClientProvider>
  );

  await screen.findAllByRole("tab");

  return container;
}

describe("tab strip", () => {
  afterEach(() => {
    clearMocks();
  });

  it.each([false, true])(
    "should count a tab click but leave history alone during a drag: %s",
    async (drag) => {
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }

      localStorage.removeItem("recent-notes:/notes");
      const first = "a";
      localStorage.setItem(
        "tabs",
        JSON.stringify({
          activeId: "b",
          carets: {},
          tabs: [
            { id: first, kind: "note", path: "a.md" },
            { id: "b", kind: "note", path: "b.md" },
          ],
        })
      );
      restoreTabs();
      registerLoadedNote(first, "/notes");
      onTestFinished(() => {
        for (const tab of getTabState().tabs) {
          closeTab(tab.id);
        }

        localStorage.removeItem("recent-notes:/notes");
      });
      await mountStrip(getTabState().tabs);
      const user = userEvent.setup();
      const target = screen.getByRole("tab", { name: "a" });
      await user.pointer({
        coords: { x: 0, y: 0 },
        keys: "[MouseLeft>]",
        target,
      });
      expect(getTabState().activeId).toBe(first);
      expect(readRecentNotes("/notes")).toStrictEqual([]);

      if (drag) {
        await user.pointer({ coords: { x: 10, y: 0 }, target });
      }

      await user.pointer({ keys: "[/MouseLeft]", target });
      expect(readRecentNotes("/notes")).toStrictEqual(drag ? [] : ["a.md"]);
    }
  );

  describe("tab labels", () => {
    it.each([String.raw`C:\notes\draft.md`, "/notes/draft.md"])(
      "should use the filename until the live title loads for %s",
      async (path) => {
        const user = userEvent.setup();
        await mountStrip([{ id: "draft", kind: "external", path }]);
        expect(screen.getByRole("tab", { name: "draft" })).toBeVisible();
        await user.click(
          screen.getByRole("button", { name: "1 tab out of view" })
        );
        expect(
          await screen.findByRole("menuitem", { name: "draft" })
        ).toBeVisible();

        const snapshot = createStore<TabSnapshot>({
          pinned: false,
          reason: undefined,
          sourceMode: false,
          status: "saved",
          tags: [],
          title: "Live title",
        });

        act(() => {
          onTestFinished(
            registerTabSnapshot(
              "draft",
              createStore(() => snapshot.get())
            )
          );
        });
        expect(screen.getByRole("tab", { name: "Live title" })).toBeVisible();
        expect(
          screen.getByRole("menuitem", { name: "Live title" })
        ).toBeVisible();
      }
    );
  });

  describe("tab glyphs", () => {
    it.each([
      { glyph: "lucide-file-text", graph: false, kind: "note", source: false },
      {
        glyph: "lucide-file-symlink",
        graph: true,
        kind: "external",
        source: false,
      },
      { glyph: "lucide-code-xml", graph: false, kind: "note", source: true },
      {
        glyph: "lucide-code-xml",
        graph: false,
        kind: "external",
        source: true,
      },
      { glyph: "lucide-waypoints", graph: true, kind: "note", source: true },
    ] as const)(
      "should show $glyph for a $kind tab with graph $graph and source $source",
      async ({ glyph, graph, kind, source }) => {
        localStorage.setItem(
          "tabs",
          JSON.stringify({
            activeId: "a",
            carets: {},
            tabs: [{ id: "a", kind, path: "/notes/a.md" }],
          })
        );
        restoreTabs();
        onTestFinished(() => {
          closeTab("a");
        });

        if (graph) {
          showGraph("a");
          onTestFinished(() => {
            hideGraph("a");
          });
        }

        const snapshot = createStore<TabSnapshot>({
          pinned: false,
          reason: undefined,
          sourceMode: source,
          status: "saved",
          tags: [],
          title: "a",
        });

        onTestFinished(
          registerTabSnapshot(
            "a",
            createStore(() => snapshot.get())
          )
        );
        await mountStrip(getTabState().tabs);

        expect(
          screen.getByRole("tab", { name: "a" }).querySelector("svg")
        ).toHaveClass(glyph);
      }
    );

    it("should show the note glyph on a draft", async () => {
      await mountStrip([{ id: "draft", kind: "draft", path: "" }]);

      expect(screen.getByRole("tab").querySelector("svg")).toHaveClass(
        "lucide-file-text"
      );
    });

    it("should put the dot in the glyph's place when a save fails", async () => {
      const snapshot = createStore<TabSnapshot>({
        pinned: false,
        reason: "disk full",
        sourceMode: true,
        status: "failed",
        tags: [],
        title: "a",
      });

      onTestFinished(
        registerTabSnapshot(
          "a",
          createStore(() => snapshot.get())
        )
      );
      await mountStrip([{ id: "a", kind: "note", path: "a.md" }]);

      const tab = screen.getByRole("tab", {
        name: "could not save: disk full a",
      });

      expect(tab.querySelector("svg")).toBeNull();
    });

    it("should select an inactive tab when its glyph is clicked", async () => {
      localStorage.setItem(
        "tabs",
        JSON.stringify({
          activeId: "a",
          carets: {},
          tabs: [
            { id: "a", kind: "note", path: "a.md" },
            { id: "b", kind: "note", path: "b.md" },
          ],
        })
      );
      restoreTabs();
      onTestFinished(() => {
        closeTab("a");
        closeTab("b");
      });
      await mountStrip(getTabState().tabs);
      const user = userEvent.setup();
      const glyph = screen.getByRole("tab", { name: "b" }).querySelector("svg");

      if (glyph === null) {
        throw new Error("tab b has no glyph");
      }

      await user.click(glyph);

      expect(getTabState().activeId).toBe("b");
    });
  });

  /**
   * Tauri's injected handler reads `data-tauri-drag-region` off the pressed
   * element's ancestors: a `deep` band moves the window from any descendant, a
   * clickable element blocks the walk unless it carries the attribute itself,
   * and `false` blocks it outright.
   */
  describe("titlebar drag region", () => {
    it("should hand a press on the band to the window", async () => {
      const container = await mountStrip([
        { id: "a", kind: "note", path: "a.md" },
      ]);

      expect(container.firstElementChild).toHaveAttribute(
        "data-tauri-drag-region",
        "deep"
      );
    });

    it("should keep a tab among neighbours off the window drag", async () => {
      await mountStrip([
        { id: "a", kind: "note", path: "a.md" },
        { id: "b", kind: "note", path: "b.md" },
      ]);
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);

      for (const tab of tabs) {
        expect(tab).not.toHaveAttribute("data-tauri-drag-region");
        expect(tab.parentElement).toHaveAttribute(
          "data-tauri-drag-region",
          "false"
        );
      }
    });

    it("should hand a lone tab's press to the window", async () => {
      await mountStrip([{ id: "a", kind: "note", path: "a.md" }]);
      const tab = screen.getByRole("tab");
      expect(tab).toHaveAttribute("data-tauri-drag-region", "deep");
      expect(tab.parentElement).not.toHaveAttribute("data-tauri-drag-region");
    });
  });
});
