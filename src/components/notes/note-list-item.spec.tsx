import { render, screen } from "@/testing/utils";

import { NoteListItem } from "./note-list-item";

vi.mock("@/actions/pin-note", () => ({ pinNote: vi.fn() }));

vi.mock("@/actions/unpin-note", () => ({ unpinNote: vi.fn() }));

const makeNote = (
  overrides: Partial<{
    content: string;
    createdAt: Date;
    id: string;
    pinnedAt: Date | null;
    remindAt: Date | null;
  }> = {},
) => {
  return {
    content: overrides.content ?? "Test note content",
    createdAt: overrides.createdAt ?? new Date(2025, 5, 15),
    folderId: null,
    id: overrides.id ?? "note_1",
    pinnedAt: overrides.pinnedAt ?? null,
    remindAt: overrides.remindAt ?? null,
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

  it("should truncate content longer than 200 characters", () => {
    const longContent = "x".repeat(250);

    render(<NoteListItem note={makeNote({ content: longContent })} />);

    expect(screen.getByText(`${"x".repeat(200)}...`)).toBeInTheDocument();
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
});
