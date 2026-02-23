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
  it("should render with the 'copy' label initially", () => {
    render(<CopyNoteButton content="hello" />);

    expect(screen.getByRole("button", { name: "copy" })).toBeInTheDocument();
  });

  it("should toggle to 'copied' after clicking", async () => {
    const user = userEvent.setup();

    render(<CopyNoteButton content="text" />);

    await user.click(screen.getByRole("button", { name: "copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "copied" }),
      ).toBeInTheDocument();
    });
  });

  it("should reset back to 'copy' after the reset delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const user = userEvent.setup();

    render(<CopyNoteButton content="text" resetDelayMs={500} />);

    await user.click(screen.getByRole("button", { name: "copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "copied" }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("button", { name: "copy" })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should stay in 'copied' when clicked again before the timer expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const user = userEvent.setup();

    render(<CopyNoteButton content="text" resetDelayMs={500} />);

    await user.click(screen.getByRole("button", { name: "copy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "copied" }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await user.click(screen.getByRole("button", { name: "copied" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Still "copied" because the second click reset the timer
    expect(screen.getByRole("button", { name: "copied" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByRole("button", { name: "copy" })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
