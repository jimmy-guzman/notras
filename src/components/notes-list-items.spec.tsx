import { render, screen } from "@testing-library/react";
import { addMinutes, startOfToday, startOfWeek, subDays } from "date-fns";

import { NotesListItems } from "./notes-list-items";

vi.mock("@/actions/archive-note", () => {
  return {
    archiveNote: vi.fn(),
  };
});

vi.mock("@/actions/pin-note", () => {
  return {
    pinNote: vi.fn(),
  };
});

vi.mock("@/actions/unpin-note", () => {
  return {
    unpinNote: vi.fn(),
  };
});

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(),
  };
});

const baseNote = {
  content: "Test note",
  pinnedAt: null,
};

describe("<NotesListItems />", () => {
  it("should render notes grouped by time with correct labels", () => {
    const notes = [
      {
        ...baseNote,
        createdAt: addMinutes(startOfToday(), 60), // Today
        id: "1",
      },
      {
        ...baseNote,
        createdAt: addMinutes(startOfWeek(new Date(), { weekStartsOn: 1 }), 60), // This Week
        id: "2",
      },
      {
        ...baseNote,
        createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), // Earlier
        id: "3",
      },
    ];

    render(<NotesListItems filteredNotes={notes} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();

    expect(screen.getAllByText("Test note")).toHaveLength(3);
  });

  it("should render multiple notes in the same group", () => {
    const today = new Date();

    const notes = [
      { ...baseNote, content: "Note 1", createdAt: today, id: "1" },
      { ...baseNote, content: "Note 2", createdAt: today, id: "2" },
    ];

    render(<NotesListItems filteredNotes={notes} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Note 1")).toBeInTheDocument();
    expect(screen.getByText("Note 2")).toBeInTheDocument();
  });

  it("should not render any groups if no notes exist", () => {
    render(<NotesListItems filteredNotes={[]} />);
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("This Week")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
  });

  it("should render each note's actions", () => {
    const note = {
      ...baseNote,
      createdAt: addMinutes(startOfToday(), 30),
      id: "1",
    };

    render(<NotesListItems filteredNotes={[note]} />);

    expect(screen.getByRole("button", { name: "Pin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("should render each note's date", () => {
    const note = {
      ...baseNote,
      createdAt: addMinutes(startOfToday(), 30),
      id: "1",
    };

    render(<NotesListItems filteredNotes={[note]} />);

    const formatted = screen.getByText((content) => {
      return content.includes("2025");
    });

    expect(formatted).toBeInTheDocument();
  });
});
