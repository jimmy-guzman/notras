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

  it("should list the notes this one links to under from this note", async () => {
    openNoteTab();
    showNotePanelTab("links");
    mockIPC((command) => {
      if (command === "read_graph") {
        return graphOfA({ outgoing: [BEE] });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    mountPanel();

    const from = await screen.findByRole("region", { name: "from this note" });
    const to = screen.getByRole("region", { name: "to this note" });

    expect(
      await within(from).findByRole("button", { name: /Bee/u })
    ).toBeInTheDocument();
    expect(
      await within(to).findByText("no notes link here")
    ).toBeInTheDocument();
  });

  it("should show both headings while the links are still loading", () => {
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

    expect(
      screen.getByRole("region", { name: "to this note" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "from this note" })
    ).toBeInTheDocument();
    expect(screen.getByText("loading links...")).toBeInTheDocument();
  });

  it("should keep the links to this note when the search for unlinked mentions fails", async () => {
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
    const to = await screen.findByRole("region", { name: "to this note" });

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

    expect(await screen.findByText("no notes link here")).toBeInTheDocument();
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
