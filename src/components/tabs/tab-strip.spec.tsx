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

const NOOP = () => {};

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
          <TabStrip activeId={tabs[0]?.id ?? ""} onNew={NOOP} tabs={tabs} />
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
          words: 2,
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
      expect(tab).toHaveAttribute("data-tauri-drag-region", "true");
      expect(tab.parentElement).not.toHaveAttribute("data-tauri-drag-region");
    });
  });
});
