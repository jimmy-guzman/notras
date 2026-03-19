import { render, screen } from "@/testing/utils";

import { NoteListItem } from "./note-list-item";

vi.mock("@/actions/pin-note", () => ({ pinNote: vi.fn() }));

vi.mock("@/actions/unpin-note", () => ({ unpinNote: vi.fn() }));

const makeNote = (
  overrides: Partial<{
    content: string;
    createdAt: Date;
    folderId: null | string;
    folderName: null | string;
    id: string;
    pinnedAt: Date | null;
    remindAt: Date | null;
    snippet: null | string;
  }> = {},
) => {
  return {
    content: overrides.content ?? "Test note content",
    createdAt: overrides.createdAt ?? new Date(2025, 5, 15),
    folderId: overrides.folderId ?? null,
    folderName: overrides.folderName ?? null,
    id: overrides.id ?? "note_1",
    pinnedAt: overrides.pinnedAt ?? null,
    remindAt: overrides.remindAt ?? null,
    snippet: overrides.snippet ?? null,
    syncedAt: null,
    updatedAt: new Date(2025, 5, 15),
    userId: "user_1",
  };
};

describe("NoteListItem", () => {
  it("should link to the note detail page", () => {
    render(<NoteListItem note={makeNote({ id: "note_abc123" })} />);

    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("href", "/notes/note_abc123");
  });

  it("should display the note content", () => {
    render(<NoteListItem note={makeNote({ content: "Buy groceries" })} />);

    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("should truncate content longer than 80 characters", () => {
    const longContent = "x".repeat(100);

    render(<NoteListItem note={makeNote({ content: longContent })} />);

    expect(screen.getByText(`${"x".repeat(80)}...`)).toBeInTheDocument();
  });

  it("should display the formatted creation date", () => {
    const date = new Date(2025, 5, 15);

    render(<NoteListItem note={makeNote({ createdAt: date })} />);

    expect(screen.getByText("jun 15, 2025")).toBeInTheDocument();
  });

  it("should highlight matching text when a query is provided", () => {
    render(
      <NoteListItem
        note={makeNote({ content: "Hello world" })}
        query="world"
      />,
    );

    const mark = screen.getByText("world");

    expect(mark.tagName).toBe("MARK");
  });

  it("should render snippet highlights when snippet is provided", () => {
    render(
      <NoteListItem
        note={makeNote({
          content: "visible title",
          snippet: "first [[hl]]match[[/hl]] second",
        })}
        query="match"
      />,
    );

    const mark = screen.getByText("match");
    const link = screen.getByRole("link", { name: /visible title/i });
    const snippetLine = screen.getByLabelText("search match snippet");

    expect(mark.tagName).toBe("MARK");
    expect(link).toHaveTextContent("visible title");
    expect(snippetLine).toHaveTextContent("first match second");
  });

  it("should show centered snippet in row for long fts snippets", () => {
    const longBefore = "x".repeat(50);
    const longAfter = "y".repeat(50);
    const fullSnippet = `${longBefore} [[hl]]cosmos[[/hl]] ${longAfter}`;

    render(
      <NoteListItem
        note={makeNote({
          content: "visible title",
          snippet: fullSnippet,
        })}
        query="cosmos"
      />,
    );

    const snippetLine = screen.getByLabelText("search match snippet");

    expect(snippetLine).toHaveTextContent(/^\.{3}.*cosmos.*\.{3}$/);
  });

  it("should render a pin button", () => {
    render(<NoteListItem note={makeNote()} />);

    expect(screen.getByRole("button", { name: "pin" })).toBeInTheDocument();
  });

  it("should render an unpin button when the note is pinned", () => {
    render(
      <NoteListItem note={makeNote({ pinnedAt: new Date(2025, 5, 15) })} />,
    );

    expect(screen.getByRole("button", { name: "unpin" })).toBeInTheDocument();
  });

  it("should show the folder link when the note has a folder and no folder filter is active", () => {
    render(
      <NoteListItem
        folderName="work"
        note={makeNote({ folderId: "folder_abc", folderName: "work" })}
      />,
    );

    const link = screen.getByRole("link", { name: /work/i });

    expect(link).toHaveAttribute("href", "/notes?folder=folder_abc");
  });

  it("should hide the folder link when already filtering by that folder", () => {
    render(
      <NoteListItem
        currentParams={{ folder: "folder_abc" }}
        folderName="work"
        note={makeNote({ folderId: "folder_abc", folderName: "work" })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /work/i }),
    ).not.toBeInTheDocument();
  });
});
