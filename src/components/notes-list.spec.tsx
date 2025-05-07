import { render, screen } from "@testing-library/react";
import {
  addDays,
  addMinutes,
  startOfToday,
  startOfWeek,
  subDays,
} from "date-fns";

import { NotesList } from "./notes-list";

vi.mock("@/actions/archive-note", () => {
  return { archiveNote: vi.fn() };
});

vi.mock("@/actions/unarchive-note", () => {
  return { unarchiveNote: vi.fn() };
});

vi.mock("@/actions/pin-note", () => {
  return { pinNote: vi.fn() };
});

vi.mock("@/actions/unpin-note", () => {
  return { unpinNote: vi.fn() };
});

vi.mock("next/navigation", () => {
  return { useRouter: vi.fn() };
});

const baseNote = {
  content: "Test note",
  kind: null,
  pinnedAt: null,
};

describe("<NotesList />", () => {
  const MOCKED_DATE = new Date("2025-05-06T12:00:00Z");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCKED_DATE);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should render notes grouped by time with correct labels", () => {
    const notes = [
      {
        ...baseNote,
        createdAt: addMinutes(startOfToday(), 60), // Today
        id: "1",
      },
      {
        ...baseNote,
        createdAt: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 2), // Wednesday
        id: "2",
      },
      {
        ...baseNote,
        createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), // Earlier
        id: "3",
      },
    ];

    render(<NotesList notes={notes} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.getAllByText("Test note")).toHaveLength(3);
  });

  it("should render multiple notes in the same time group", () => {
    const today = new Date();

    const notes = [
      { ...baseNote, content: "Note 1", createdAt: today, id: "1" },
      { ...baseNote, content: "Note 2", createdAt: today, id: "2" },
    ];

    render(<NotesList notes={notes} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Note 1")).toBeInTheDocument();
    expect(screen.getByText("Note 2")).toBeInTheDocument();
  });

  it("should render note actions: pin, copy, archive", () => {
    const note = {
      ...baseNote,
      createdAt: new Date(),
      id: "1",
    };

    render(<NotesList notes={[note]} />);

    expect(screen.getByRole("button", { name: "Pin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("should show the note's date", () => {
    const note = {
      ...baseNote,
      createdAt: new Date("2025-05-01T15:00:00Z"),
      id: "1",
    };

    render(<NotesList notes={[note]} />);

    expect(
      screen.getByText((text) => {
        return text.includes("2025");
      }),
    ).toBeInTheDocument();
  });

  it("should show a badge when note has a kind", () => {
    const note = {
      ...baseNote,
      createdAt: new Date(),
      id: "1",
      kind: "dream" as const,
    };

    render(<NotesList notes={[note]} />);

    const badge = screen.getByText("Dream");

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("capitalize");
  });

  it("should render nothing if notes list is empty", () => {
    render(<NotesList notes={[]} />);
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("This Week")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
  });
});
