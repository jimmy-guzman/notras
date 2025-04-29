import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";
import { PinNote } from "@/components/pin-note";

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

describe("<PinNote />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render correctly when not pinned", () => {
    render(<PinNote noteId="note-1" pinned={false} />);

    const button = screen.getByRole("button", { name: /pin/i });

    expect(button).toBeInTheDocument();
  });

  it("should render correctly when pinned", () => {
    render(<PinNote noteId="note-1" pinned />);

    const button = screen.getByRole("button", { name: /unpin/i });

    expect(button).toBeInTheDocument();
  });

  it("should call pinNote and refresh when clicking if not pinned", async () => {
    const mockRefresh = vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
    });

    render(<PinNote noteId="note-1" pinned={false} />);

    const button = screen.getByRole("button", { name: /pin/i });

    await userEvent.click(button);

    expect(pinNote).toHaveBeenCalledWith("note-1");
    expect(mockRefresh).toHaveBeenCalledWith();
  });

  it("should call unpinNote and refresh when clicking if pinned", async () => {
    const mockRefresh = vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
    });

    render(<PinNote noteId="note-2" pinned />);

    const button = screen.getByRole("button", { name: /unpin/i });

    await userEvent.click(button);

    expect(unpinNote).toHaveBeenCalledWith("note-2");
    expect(mockRefresh).toHaveBeenCalledWith();
  });
});
