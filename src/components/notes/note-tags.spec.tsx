import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, onTestFinished, vi } from "vitest";
import { createNotePersistence } from "@/components/editor/note-persistence";
import { NoteTags } from "@/components/notes/note-tags";
import { TagsView } from "@/components/palette-note-views";
import { Command, CommandList } from "@/components/ui/command";
import { parseNote } from "@/core/frontmatter";
import { noteQueries } from "@/data/queries";
import {
  closeTab,
  getTabState,
  openNote,
  registerTabHandles,
} from "@/lib/tabs/store";

it.each(["combobox", "palette"])(
  "should retain rapid tag toggles from the %s before its displayed tags refresh",
  async (control) => {
    const saved = Promise.withResolvers<{ path: string; updatedAt: Date }>();
    const writes: string[] = [];
    const note = createNotePersistence(
      {
        content: "# Note",
        kind: "note",
        path: "note.md",
        updatedAt: new Date(0),
      },
      {
        changePath: () => Promise.reject(new Error("no move requested")),
        onPathChanged: () => undefined,
        write: (_path, content) => {
          writes.push(content);
          return saved.promise;
        },
      }
    );
    openNote("note.md");
    const id = getTabState().activeId;
    registerTabHandles(id, {
      editMetadata: note.editMetadata,
      getCaret: () => 0,
      insertText: () => undefined,
      toggleSource: () => undefined,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(noteQueries.tags().queryKey, [
      { count: 1, tag: "first" },
      { count: 1, tag: "second" },
    ]);
    onTestFinished(async () => {
      await act(async () => {
        saved.resolve({ path: "note.md", updatedAt: new Date(1) });
        await note.flush();
        closeTab(id);
      });
      client.clear();
    });
    const ignore = () => undefined;
    render(
      <QueryClientProvider client={client}>
        {control === "combobox" ? (
          <NoteTags onFilter={ignore} path="note.md" tags={[]} />
        ) : (
          <Command shouldFilter={false}>
            <CommandList>
              <TagsView
                attached={[]}
                onDone={ignore}
                onQueryChange={ignore}
                path="note.md"
                query=""
                title="Note"
              />
            </CommandList>
          </Command>
        )}
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    if (control === "combobox") {
      await user.click(screen.getByRole("combobox", { name: "add tag" }));
    }
    await user.click(screen.getByRole("option", { name: "first 1" }));
    await user.click(screen.getByRole("option", { name: "second 1" }));
    expect(parseNote(note.store.state.content).frontmatter.tags).toEqual([
      "first",
      "second",
    ]);
    await user.click(screen.getByRole("option", { name: "first 1" }));
    expect(parseNote(note.store.state.content).frontmatter.tags).toEqual([
      "second",
    ]);
    await act(async () => {
      saved.resolve({ path: "note.md", updatedAt: new Date(1) });
      await note.flush();
    });
    expect(parseNote(writes.at(-1) ?? "").frontmatter.tags).toEqual(["second"]);
  }
);

it("should keep attached tags and typed choices available while suggestions load", async () => {
  const listed = Promise.withResolvers<[]>();
  mockIPC((command) => {
    if (command === "list_tags") {
      return listed.promise;
    }
    throw new Error(`unexpected command: ${command}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  onTestFinished(async () => {
    await act(() => {
      listed.resolve([]);
    });
    client.clear();
    clearMocks();
  });
  const onFilter = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <NoteTags onFilter={onFilter} path="a.md" tags={["attached"]} />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "#attached" })).toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "add tag" }));
  expect(
    await screen.findByText("loading tag suggestions...")
  ).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("filter tags..."), "newtag");
  expect(screen.getByRole("option", { name: "newtag" })).toBeInTheDocument();
  expect(screen.queryByText("no tags yet")).not.toBeInTheDocument();
});
