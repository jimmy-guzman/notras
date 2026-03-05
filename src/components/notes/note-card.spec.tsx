import { render, screen } from "@/testing/utils";

import { NoteCard } from "./note-card";

vi.mock("@/actions/pin-note", () => ({ pinNote: vi.fn() }));

vi.mock("@/actions/unpin-note", () => ({ unpinNote: vi.fn() }));

const makeNote = (
  overrides: Partial<{
    content: string;
    createdAt: Date;
    id: string;
    pinnedAt: Date | null;
  }> = {},
) => {
  return {
    content: overrides.content ?? "Test note content",
    createdAt: overrides.createdAt ?? new Date("2025-06-15"),
    folderId: null,
    id: overrides.id ?? "note_1",
    pinnedAt: overrides.pinnedAt ?? null,
    remindAt: null,
    syncedAt: null,
    updatedAt: new Date("2025-06-15"),
    userId: "user_1",
  };
};

describe("NoteCard", () => {
  it("should link to the note detail page", () => {
    render(<NoteCard note={makeNote({ id: "note_abc123" })} />);

    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("href", "/notes/note_abc123");
  });

  it("should display the note content", () => {
    render(<NoteCard note={makeNote({ content: "Buy groceries" })} />);

    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("should truncate content longer than 120 characters", () => {
    const longContent = "x".repeat(150);

    render(<NoteCard note={makeNote({ content: longContent })} />);

    expect(screen.getByText(`${"x".repeat(120)}...`)).toBeInTheDocument();
  });

  it("should not truncate content that is 120 characters or fewer", () => {
    const content = "y".repeat(120);

    render(<NoteCard note={makeNote({ content })} />);

    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it("should display the formatted creation date", () => {
    const date = new Date(2025, 5, 15);

    render(<NoteCard note={makeNote({ createdAt: date })} />);

    expect(screen.getByText("jun 15, 2025")).toBeInTheDocument();
  });

  it("should highlight matching text when a query is provided", () => {
    render(
      <NoteCard note={makeNote({ content: "Hello world" })} query="world" />,
    );

    const mark = screen.getByText("world");

    expect(mark.tagName).toBe("MARK");
  });

  it("should not highlight text when no query is provided", () => {
    render(<NoteCard note={makeNote({ content: "Hello world" })} />);

    expect(screen.queryByRole("mark")).not.toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("should render a pin button", () => {
    render(<NoteCard note={makeNote()} />);

    expect(screen.getByRole("button", { name: "pin" })).toBeInTheDocument();
  });

  it("should render an unpin button when the note is pinned", () => {
    render(<NoteCard note={makeNote({ pinnedAt: new Date("2025-06-15") })} />);

    expect(screen.getByRole("button", { name: "unpin" })).toBeInTheDocument();
  });
});
