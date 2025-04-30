import type { Mock } from "vitest";

import userEvent from "@testing-library/user-event";

import { CopyNote } from "@/components/copy-note";
import { render, screen, waitFor } from "@/testing/utils";

vi.stubGlobal("navigator", {
  clipboard: {
    writeText: vi.fn(),
  },
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

    await expect(
      screen.findByRole("button", { name: /copied/i }),
    ).resolves.toBeInTheDocument();
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

  it("should show error toast if clipboard write fails", async () => {
    (navigator.clipboard.writeText as Mock).mockRejectedValueOnce(
      new Error("Clipboard error"),
    );

    render(<CopyNote content="Failure case" />);
    const button = screen.getByRole("button", { name: /copy/i });

    await userEvent.click(button);

    await expect(
      screen.findByText(/failed to copy to clipboard/i),
    ).resolves.toBeInTheDocument();
  });
});
