import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { archiveNote } from "@/actions/archive-note";
import { ArchiveNote } from "@/components/archive-note";

vi.mock("@/actions/archive-note", () => {
  return {
    archiveNote: vi.fn(),
  };
});

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(),
  };
});

describe("<ArchiveNote />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render correctly", () => {
    render(<ArchiveNote noteId="note-1" />);

    const button = screen.getByRole("button", { name: /archive/i });

    expect(button).toBeInTheDocument();
  });

  it("should call archiveNote and refresh when clicked", async () => {
    const mockRefresh = vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
    });

    render(<ArchiveNote noteId="note-1" />);

    const button = screen.getByRole("button", { name: /archive/i });

    await userEvent.click(button);

    expect(archiveNote).toHaveBeenCalledWith("note-1");
    expect(mockRefresh).toHaveBeenCalledWith();
  });
});
