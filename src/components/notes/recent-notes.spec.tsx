import { render, screen, within } from "@/testing/utils";

import { RecentNotes } from "./recent-notes";

vi.mock("motion/react", () => {
  return {
    motion: {
      li: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => {
        return <li {...props}>{children}</li>;
      },
    },
  };
});

const makeNote = (overrides: { content: string; id: string }) => {
  return {
    content: overrides.content,
    createdAt: new Date("2025-01-01"),
    id: overrides.id,
    pinnedAt: null,
    syncedAt: null,
    updatedAt: new Date("2025-01-01"),
    userId: "user_1",
  };
};

describe("RecentNotes", () => {
  it("should render nothing when the notes array is empty", () => {
    render(<RecentNotes notes={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Notes")).not.toBeInTheDocument();
  });

  it("should render each note as a link to its detail page", () => {
    const notes = [
      makeNote({ content: "First note", id: "note_1" }),
      makeNote({ content: "Second note", id: "note_2" }),
    ];

    render(<RecentNotes notes={notes} />);

    const links = screen.getAllByRole("link");
    const noteLinks = links.filter((link) => {
      return link.getAttribute("href")?.startsWith("/notes/note_");
    });

    expect(noteLinks).toHaveLength(2);
    expect(noteLinks[0]).toHaveAttribute("href", "/notes/note_1");
    expect(noteLinks[1]).toHaveAttribute("href", "/notes/note_2");
  });

  it("should truncate content longer than 80 characters", () => {
    const longContent = "a".repeat(100);
    const notes = [makeNote({ content: longContent, id: "note_1" })];

    render(<RecentNotes notes={notes} />);

    const link = screen.getByRole("link", { name: /^a+\.\.\./ });

    expect(link).toHaveTextContent(`${"a".repeat(80)}...`);
  });

  it("should not truncate content that is 80 characters or fewer", () => {
    const shortContent = "a".repeat(80);
    const notes = [makeNote({ content: shortContent, id: "note_1" })];

    render(<RecentNotes notes={notes} />);

    expect(screen.getByText(shortContent)).toBeInTheDocument();
  });

  it("should render a 'view all notes' link", () => {
    const notes = [makeNote({ content: "Note", id: "note_1" })];

    render(<RecentNotes notes={notes} />);

    const link = screen.getByRole("link", { name: /view all notes/ });

    expect(link).toHaveAttribute("href", "/notes");
  });

  it("should render separators between items but not before the first", () => {
    const notes = [
      makeNote({ content: "First", id: "note_1" }),
      makeNote({ content: "Second", id: "note_2" }),
      makeNote({ content: "Third", id: "note_3" }),
    ];

    render(<RecentNotes notes={notes} />);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");

    expect(
      items[0].querySelector("[data-slot='separator']"),
    ).not.toBeInTheDocument();
    expect(
      items[1].querySelector("[data-slot='separator']"),
    ).toBeInTheDocument();
    expect(
      items[2].querySelector("[data-slot='separator']"),
    ).toBeInTheDocument();
  });
});
