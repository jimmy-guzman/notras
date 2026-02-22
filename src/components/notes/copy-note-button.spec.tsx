import userEvent from "@testing-library/user-event";

import { act, render, screen, waitFor } from "@/testing/utils";

import { CopyNoteButton } from "./copy-note-button";

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
  });
});

describe("CopyNoteButton", () => {
  it("should render with the 'Copy' label initially", () => {
    render(<CopyNoteButton content="hello" />);

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("should toggle to 'Copied' after clicking", async () => {
    const user = userEvent.setup();

    render(<CopyNoteButton content="text" />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });
  });

  it("should reset back to 'Copy' after the reset delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const user = userEvent.setup();

    render(<CopyNoteButton content="text" resetDelayMs={500} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should stay in 'Copied' when clicked again before the timer expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const user = userEvent.setup();

    render(<CopyNoteButton content="text" resetDelayMs={500} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await user.click(screen.getByRole("button", { name: "Copied" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Still "Copied" because the second click reset the timer
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
