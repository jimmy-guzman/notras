import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { archiveNote } from "@/actions/archive-note";
import { unarchiveNote } from "@/actions/unarchive-note";
import { render, screen } from "@/testing/utils";

import { ArchiveNoteButton } from "./archive-note-button";

vi.mock("@/actions/archive-note", () => ({ archiveNote: vi.fn() }));

vi.mock("@/actions/unarchive-note", () => ({ unarchiveNote: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

describe("<ArchiveNote />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render correctly", () => {
    render(<ArchiveNoteButton isArchived={false} noteId="note-1" />);

    const button = screen.getByRole("button", { name: /archive/i });

    expect(button).toBeInTheDocument();
  });

  it("should archive note and allow undo", async () => {
    globalThis.HTMLElement.prototype.setPointerCapture = vi.fn();

    const mockRefresh = vi.fn();

    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: mockRefresh,
      replace: vi.fn(),
    });

    render(<ArchiveNoteButton isArchived={false} noteId="note-1" />);

    const button = screen.getByRole("button", { name: /archive/i });

    await userEvent.click(button);

    expect(archiveNote).toHaveBeenCalledWith("note-1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    const undoButton = await screen.findByRole("button", { name: /undo/i });

    await userEvent.click(undoButton);

    expect(unarchiveNote).toHaveBeenCalledWith("note-1");
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});
