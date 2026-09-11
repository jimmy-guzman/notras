import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode, useCallback } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  DeleteView,
  MoveView,
  TagsView,
} from "@/components/palette-note-views";
import { Command, CommandList } from "@/components/ui/command";
import { NoteSession } from "@/components/workspace/note-session";
import { parseNote } from "@/core/frontmatter";
import { noteQueries } from "@/data/queries";
import { flushPendingWrites } from "@/lib/pending-flush";
import {
  closeTab,
  getTabState,
  openNote,
  useTabSnapshot,
} from "@/lib/tabs/store";

function SessionTags({
  id,
  onQueryChange,
  query,
}: {
  id: string;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const snapshot = useTabSnapshot(id);
  const done = useCallback(() => undefined, []);
  return snapshot === undefined ? null : (
    <TagsView
      attached={snapshot.tags}
      onDone={done}
      onQueryChange={onQueryChange}
      path="atlas.md"
      query={query}
      title={snapshot.title}
    />
  );
}

function mount(view: ReactNode, client: QueryClient) {
  onTestFinished(() => client.clear());
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        Command,
        { label: "note action", shouldFilter: false },
        createElement(CommandList, null, view)
      )
    )
  );
}

afterEach(() => {
  for (const tab of getTabState().tabs) {
    closeTab(tab.id);
  }
  clearMocks();
});

describe("palette note views", () => {
  it("should select the matching existing folder without offering root or a duplicate new folder", async () => {
    const user = userEvent.setup();
    const moved: string[] = [];
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(
      noteQueries.list().queryKey,
      ["root.md", "Client Work/a.md", "Client Work/2026/b.md"].map((path) => ({
        createdAt: new Date(1),
        folder: path.slice(0, Math.max(0, path.lastIndexOf("/"))),
        path,
        pinned: false,
        snippet: null,
        tags: [],
        title: "Note",
        updatedAt: new Date(1),
      }))
    );
    const { container: host } = mount(
      createElement(MoveView, {
        onCancel: () => undefined,
        onMove: (folder) => moved.push(folder),
        onMoveToNewFolder: () => moved.push("new"),
        query: "client work",
      }),
      client
    );
    expect(host.textContent).not.toContain("notes root");
    expect(host.textContent).not.toContain("new folder");
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toContain("Client Work");
    await user.click(selected);
    expect(moved).toEqual(["Client Work"]);
  });

  it.each(["available", "pending", "failed"])(
    "should expose tag attachment and edit tags with %s suggestions",
    async (state) => {
      const vocabulary = Promise.withResolvers<[]>();
      const writes: string[] = [];
      mockIPC((command, args) => {
        if (command === "list_tags") {
          return vocabulary.promise;
        }
        if (command === "list_notes") {
          return [];
        }
        if (command === "get_notes_dir") {
          return "/notes";
        }
        if (command === "read_note") {
          return {
            content: "---\ntags:\n  - work\n---\n# Atlas\n",
            pinned: false,
            tags: ["work"],
            title: "Atlas",
            updatedAt: 1,
          };
        }
        if (
          command === "save_note" &&
          args !== undefined &&
          "content" in args &&
          typeof args.content === "string"
        ) {
          writes.push(args.content);
          return { path: "atlas.md", updatedAt: 2, warnings: [] };
        }
        throw new Error(`unexpected command: ${command}`);
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });
      if (state === "available") {
        client.setQueryData(noteQueries.tags().queryKey, [
          { count: 1, tag: "review" },
          { count: 2, tag: "work" },
        ]);
      }
      openNote("atlas.md");
      const [tab] = getTabState().tabs;
      if (tab === undefined) {
        throw new Error("the note did not open");
      }
      onTestFinished(async () => {
        await act(() => {
          vocabulary.resolve([]);
        });
        client.clear();
      });
      const changeQuery = vi.fn();
      const view = (query: string) => (
        <QueryClientProvider client={client}>
          <NoteSession active tab={tab} />
          <Command label="note action" shouldFilter={false}>
            <CommandList>
              <SessionTags
                id={tab.id}
                onQueryChange={changeQuery}
                query={query}
              />
            </CommandList>
          </Command>
        </QueryClientProvider>
      );
      const { rerender } = render(view(""));
      await screen.findByRole("heading", { name: "Atlas" });
      if (state === "failed") {
        await act(() => {
          vocabulary.reject({
            kind: "failed",
            message: "tag index unavailable",
          });
        });
        expect(
          await screen.findByText("could not load tag suggestions")
        ).toBeInTheDocument();
      }
      const user = userEvent.setup();
      const attached = screen.getByRole("option", {
        name: state === "available" ? "work 2" : "work",
      });
      expect(attached.textContent).toContain("work");
      if (state === "available") {
        expect(attached).toHaveAttribute("aria-selected", "false");
      }
      expect(attached).toHaveAttribute("aria-checked", "true");
      await user.click(attached);
      await act(async () => {
        await flushPendingWrites();
      });
      expect(
        writes.map((content) => parseNote(content).frontmatter.tags)
      ).toEqual([[]]);
      rerender(view("newtag"));
      await user.click(screen.getByRole("option", { name: 'add "newtag"' }));
      await act(async () => {
        await flushPendingWrites();
      });
      expect(
        writes.map((content) => parseNote(content).frontmatter.tags)
      ).toEqual([[], ["newtag"]]);
      expect(changeQuery).toHaveBeenCalledWith("");
    }
  );

  it("should default deletion confirmation to cancel", async () => {
    const user = userEvent.setup();
    const actions: string[] = [];
    const client = new QueryClient();
    mount(
      createElement(DeleteView, {
        onCancel: () => actions.push("cancel"),
        onConfirm: () => actions.push("delete"),
        title: "Atlas",
      }),
      client
    );
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toBe("cancel");
    await user.click(selected);
    expect(actions).toEqual(["cancel"]);
  });
});
