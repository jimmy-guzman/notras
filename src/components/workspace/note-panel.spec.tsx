import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";

import type { Frontmatter } from "@/core/frontmatter";
import {
  closeTab,
  getTabState,
  registerTabHandles,
  registerTabSnapshot,
  restoreTabs,
} from "@/lib/tabs/store";
import type { TabSnapshot } from "@/lib/tabs/store";
import {
  closeNotePanel,
  openNotePanel,
  showNotePanelTab,
} from "@/lib/ui/note-panel";

import { NotePanel } from "./note-panel";

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

  const sourceMode = createStore(false);

  registerTabSnapshot(
    "a",
    createStore((): TabSnapshot => ({
      pinned: false,
      reason: undefined,
      sourceMode: sourceMode.get(),
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
    setSource: (on) => {
      sourceMode.setState(() => on);
    },
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

  it("should add no tag on the Enter WebKit sends after compositionend to confirm a candidate", async () => {
    const written = openNoteTab();
    mockIPC((command) => {
      if (command === "list_tags") {
        return [];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();
    const input = screen.getByRole("textbox", { name: "add a tag" });

    await user.type(input, "foo");
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(input).toHaveValue("foo");
    expect(written).toStrictEqual([]);

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
  lines: [{ at: 4, context: "see a", line: 1 }],
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

interface GraphOfA {
  incoming?: (typeof BEE)[];
  mentionsError?: { kind: string; message: string } | null;
  outgoing?: (typeof BEE)[];
}

/** The native graph of a.md, linked from and to the notes given. */
function graphOfA({
  incoming = [],
  mentionsError = null,
  outgoing = [],
}: GraphOfA) {
  return {
    mentionsError,
    picture: {
      graph: { dangling: [], hubs: [], incoming, outgoing },
      kind: "note",
      note: { ...BEE.note, path: "a.md", title: "A" },
    },
  };
}

describe("note panel links", () => {
  it("should keep the links on screen when a refresh fails", async () => {
    openNoteTab();
    showNotePanelTab("links");
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_graph") {
        reads += 1;

        if (reads > 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return graphOfA({ incoming: [BEE] });
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

  it("should say why the links failed and load them again on retry", async () => {
    openNoteTab();
    showNotePanelTab("links");
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_graph") {
        reads += 1;

        if (reads === 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return graphOfA({ incoming: [BEE] });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();

    expect(await screen.findByText("the disk is busy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));

    expect(await screen.findByText("Bee")).toBeInTheDocument();
    expect(screen.queryByText("the disk is busy")).not.toBeInTheDocument();
  });

  it.each([
    {
      incoming: [BEE],
      label: "references this note",
      outgoing: [],
    },
    {
      incoming: [],
      label: "referenced by this note",
      outgoing: [BEE],
    },
    {
      incoming: [BEE],
      label: "references both ways",
      outgoing: [BEE],
    },
  ])(
    "should describe the direction as $label",
    async ({ incoming, label, outgoing }) => {
      openNoteTab();
      showNotePanelTab("links");
      mockIPC((command) => {
        if (command === "read_graph") {
          return graphOfA({ incoming, outgoing });
        }

        throw new Error(`unexpected command: ${command}`);
      });
      const { user } = mountPanel();

      const list = await screen.findByRole("list", {
        name: "links and mentions",
      });

      const rows = await within(list).findAllByRole("button");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAccessibleName(`Bee see a ${label}`);
      await user.hover(
        screen.getByRole("button", { name: `Bee see a ${label}` })
      );
      expect(
        await screen.findByText(label, {
          selector: '[data-slot="tooltip-content"]',
        })
      ).toBeVisible();
    }
  );

  it("should keep incoming order and context before outgoing-only notes", async () => {
    openNoteTab();
    showNotePanelTab("links");
    mockIPC((command) => {
      if (command === "read_graph") {
        return graphOfA({
          incoming: [
            BEE,
            {
              ...BEE,
              note: { ...BEE.note, folder: "work", path: "work/bee.md" },
            },
          ],
          outgoing: [
            { ...BEE, note: { ...BEE.note, path: "ant.md", title: "Ant" } },
            {
              ...BEE,
              lines: [{ at: 4, context: "see Bee from here", line: 2 }],
            },
          ],
        });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    mountPanel();

    const list = await screen.findByRole("list", {
      name: "links and mentions",
    });

    const rows = await within(list).findAllByRole("button");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAccessibleName("Bee see a references both ways");
    expect(rows[1]).toHaveAccessibleName("Bee work see a references this note");
    expect(rows[2]).toHaveAccessibleName("Ant see a referenced by this note");
    expect(screen.queryByText("see Bee from here")).not.toBeInTheDocument();
  });

  it("should explain a focused row and open its note beside the current note", async () => {
    openNoteTab();
    showNotePanelTab("links");
    mockIPC((command) => {
      if (command === "read_graph") {
        return graphOfA({ incoming: [BEE] });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();

    const row = await screen.findByRole("button", {
      name: "Bee see a references this note",
    });

    onTestFinished(() => {
      for (const tab of getTabState().tabs.filter(
        (candidate) => candidate.id !== "a"
      )) {
        closeTab(tab.id);
      }
    });
    await user.tab();
    expect(row).toHaveFocus();
    expect(
      await screen.findByText("references this note", {
        selector: '[data-slot="tooltip-content"]',
      })
    ).toBeVisible();
    await user.keyboard("{Enter}");

    expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "bee.md",
    ]);
  });

  it("should wait for links without showing an empty result", () => {
    openNoteTab();
    showNotePanelTab("links");
    const graph = Promise.withResolvers<ReturnType<typeof graphOfA>>();
    mockIPC(async (command) => {
      if (command === "read_graph") {
        return await graph.promise;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    mountPanel();

    expect(screen.getByText("loading links...")).toBeInTheDocument();
    expect(screen.queryByText("no links or mentions")).not.toBeInTheDocument();
    expect(screen.queryByText("to this note")).not.toBeInTheDocument();
    expect(screen.queryByText("from this note")).not.toBeInTheDocument();
  });

  it("should keep the references this note when the search for unlinked mentions fails", async () => {
    openNoteTab();
    showNotePanelTab("links");
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_graph") {
        reads += 1;

        return graphOfA({
          incoming: [BEE],
          mentionsError:
            reads === 1
              ? { kind: "failed", message: "the disk is busy" }
              : null,
        });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const { user } = mountPanel();
    const to = screen.getByRole("complementary");

    expect(
      await within(to).findByRole("button", { name: /Bee/u })
    ).toBeInTheDocument();
    expect(await within(to).findByText("the disk is busy")).toBeInTheDocument();

    await user.click(within(to).getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(
        within(to).queryByText("the disk is busy")
      ).not.toBeInTheDocument();
    });
    expect(
      within(to).getByRole("button", { name: /Bee/u })
    ).toBeInTheDocument();
  });
});

describe("note panel footer", () => {
  it("should light the view picked from the footer", async () => {
    openNoteTab();
    showNotePanelTab("outline");
    const { user } = mountPanel();

    await user.click(screen.getByRole("button", { name: "markdown source" }));

    expect(
      screen.getByRole("button", { name: "markdown source" })
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "graph view" }));

    expect(screen.getByRole("button", { name: "graph view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: "markdown source" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("should keep the view when its lit toggle is clicked", async () => {
    openNoteTab();
    showNotePanelTab("outline");
    const { user } = mountPanel();

    await user.click(screen.getByRole("button", { name: "markdown source" }));
    await user.click(screen.getByRole("button", { name: "markdown source" }));

    expect(
      screen.getByRole("button", { name: "markdown source" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("should keep the footer when no notes link here", async () => {
    openNoteTab();
    showNotePanelTab("links");
    mockIPC((command) => {
      if (command === "read_graph") {
        return { mentionsError: null, picture: null };
      }

      throw new Error(`unexpected command: ${command}`);
    });
    mountPanel();

    expect(await screen.findByText("no links or mentions")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "view" })).toBeInTheDocument();
  });

  it("should offer no graph for a file opened from outside", () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "x",
        carets: {},
        tabs: [{ id: "x", kind: "external", path: "/elsewhere/x.md" }],
      })
    );
    restoreTabs();
    onTestFinished(() => {
      closeTab("x");
      localStorage.removeItem("tabs");
    });
    mountPanel();

    expect(
      screen.getByRole("button", { name: "markdown source" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "graph view" })
    ).not.toBeInTheDocument();
  });

  it("should hand focus to the first link once they load, past the footer", async () => {
    openNoteTab();

    const graph = Promise.withResolvers<ReturnType<typeof graphOfA>>();

    mockIPC(async (command) => {
      if (command === "read_graph") {
        return await graph.promise;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    openNotePanel("links");
    onTestFinished(() => {
      closeNotePanel();
    });
    mountPanel();

    await waitFor(() => {
      expect(screen.getByRole("complementary")).toHaveFocus();
    });
    act(() => {
      graph.resolve(graphOfA({ incoming: [BEE] }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Bee/u })).toHaveFocus();
    });
  });
});
