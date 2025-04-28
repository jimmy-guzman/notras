import type { Mock } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { CopyNote } from "@/components/copy-note";

vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
vi.mock("sonner", () => {
  return {
    toast: {
      error: vi.fn(),
    },
  };
});

describe("<CopyNote />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should copy content when clicked", async () => {
    render(<CopyNote content="Hello world" />);

    const button = screen.getByRole("button", { name: /copy/i });

    await userEvent.click(button);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- this is okay
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello world");
  });

  it('should show "Copied" after copying', async () => {
    render(<CopyNote content="Sample note" />);

    const button = screen.getByRole("button", { name: /copy/i });

    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /copied/i }),
      ).toBeInTheDocument();
    });
  });

  it('should reset back to "Copy" after delay', async () => {
    render(<CopyNote content="Sample note" resetDelayMs={100} />);

    const button = screen.getByRole("button", { name: /copy/i });

    await userEvent.click(button);

    await screen.findByRole("button", { name: /copied/i });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });
  });

  it("should show an error toast if copy fails", async () => {
    (navigator.clipboard.writeText as Mock).mockRejectedValueOnce(
      new Error("Copy failed"),
    );

    render(<CopyNote content="Failure case" />);

    const button = screen.getByRole("button", { name: /copy/i });

    await userEvent.click(button);

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to copy to clipboard. Please try again.",
    );
  });
});
