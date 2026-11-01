import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";

import { NotePanel } from "@/components/workspace/note-panel";
import type { Frontmatter } from "@/core/frontmatter";
import {
  closeTab,
  getTabState,
  registerTabHandles,
  registerTabSnapshot,
  restoreTabs,
} from "@/lib/tabs/store";
import type { TabSnapshot } from "@/lib/tabs/store";
import { showNotePanelTab } from "@/lib/ui/note-panel";

/** A note tab whose tag edits land in the returned list. */
function openNoteTab() {
  localStorage.setItem(
    "tabs",
    JSON.stringify({
      activeId: "a",
      carets: {},
      tabs: [{ id: "a", kind: "note", path: "a.md" }],
    })
  );
  restoreTabs();
  const written: string[][] = [];
  const current: Frontmatter = { pinned: false, tags: [], title: undefined };

  registerTabSnapshot(
    "a",
    createStore((): TabSnapshot => ({
      pinned: false,
      reason: undefined,
      sourceMode: false,
      status: "saved",
      tags: [],
      title: "A",
    }))
  );
  registerTabHandles("a", {
    editMetadata: async (edit) => {
      written.push(edit(current).tags ?? []);
      await Promise.resolve();
    },
    exportPdf: async () => null,
    focus: () => {},
    getCaret: () => 0,
    insertText: () => {},
    setSource: () => {},
  });
  showNotePanelTab("tags");
  onTestFinished(() => {
    closeTab("a");
    showNotePanelTab("outline");
    clearMocks();
    localStorage.removeItem("tabs");
  });

  return written;
}

function mountPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  onTestFinished(() => {
    client.clear();
  });
  render(
    <QueryClientProvider client={client}>
      <NotePanel tab={getTabState().tabs[0]} />
    </QueryClientProvider>
  );

  return { client, user: userEvent.setup() };
}

describe("note panel tags", () => {
  it("should add the typed tag on Enter when a longer tag starts with it", async () => {
    const written = openNoteTab();
    mockIPC((command) => {
      if (command === "list_tags") {
        return [{ count: 1, tag: "foobar" }];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();

    await user.type(screen.getByRole("textbox", { name: "add a tag" }), "foo");
    await screen.findByRole("button", { name: "foobar" });
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(written).toStrictEqual([["foo"]]);
    });
  });

  it("should say why tag suggestions failed and load them again on retry", async () => {
    openNoteTab();
    let reads = 0;
    mockIPC((command) => {
      if (command === "list_tags") {
        reads += 1;

        if (reads === 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [{ count: 1, tag: "foobar" }];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();

    expect(await screen.findByText("the disk is busy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));
    await user.type(screen.getByRole("textbox", { name: "add a tag" }), "foo");

    expect(
      await screen.findByRole("button", { name: "foobar" })
    ).toBeInTheDocument();
    expect(screen.queryByText("the disk is busy")).not.toBeInTheDocument();
  });
});

/** One note linking here, as the native index reports it. */
const BEE = {
  lines: [{ context: "see [[a]]", line: 1, match: "[[a]]" }],
  note: {
    createdAt: 0,
    folder: "",
    path: "bee.md",
    pinned: false,
    snippet: null,
    tags: [],
    title: "Bee",
    updatedAt: 0,
  },
};

describe("note panel mentions", () => {
  it("should keep the mentions on screen when a refresh fails", async () => {
    openNoteTab();
    showNotePanelTab("mentions");
    let reads = 0;
    mockIPC((command) => {
      if (command === "find_mentions") {
        reads += 1;

        if (reads > 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [BEE];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { client } = mountPanel();

    await screen.findByText("Bee");
    await act(async () => {
      await client.invalidateQueries();
    });

    expect(reads).toBe(2);
    expect(screen.getByText("Bee")).toBeInTheDocument();
    expect(screen.queryByText("the disk is busy")).not.toBeInTheDocument();
  });

  it("should say why mentions failed and load them again on retry", async () => {
    openNoteTab();
    showNotePanelTab("mentions");
    let reads = 0;
    mockIPC((command) => {
      if (command === "find_mentions") {
        reads += 1;

        if (reads === 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [BEE];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();

    expect(await screen.findByText("the disk is busy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));

    expect(await screen.findByText("Bee")).toBeInTheDocument();
    expect(screen.queryByText("the disk is busy")).not.toBeInTheDocument();
  });
});
