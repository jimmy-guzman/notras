import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  closeTab,
  getTabState,
  reclassifyTabs,
  restoreTabs,
} from "@/lib/tabs/store";
import { serializeTabs } from "@/lib/tabs/tab";

import { hideGraph, showGraph, useTabView } from "./view";

describe("view", () => {
  it("should drop the graph once a folder change turns its note tab external, and keep it dropped when the tab is a note again", async ({
    onTestFinished,
  }) => {
    localStorage.setItem(
      "tabs",
      serializeTabs({
        activeId: "a",
        carets: {},
        tabs: [{ id: "a", kind: "note", path: "a.md" }],
      })
    );
    restoreTabs();
    onTestFinished(() => {
      hideGraph("a");

      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }

      localStorage.removeItem("tabs");
    });

    showGraph("a");
    const { result } = renderHook(() => useTabView("a"));

    expect(result.current).toBe("graph");

    await act(async () => {
      await reclassifyTabs(
        async () => [{ kind: "external", path: "/elsewhere/a.md" }],
        "/notes"
      );
    });

    expect(result.current).toBe("note");

    await act(async () => {
      await reclassifyTabs(
        async () => [{ kind: "note", path: "a.md" }],
        "/elsewhere"
      );
    });

    expect(result.current).toBe("note");
  });
});
