import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { NewNoteInput } from "@/components/new-note-input";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";
import { render, screen, waitFor } from "@/testing/utils";

vi.mock("@/actions/save-note", () => {
  return {
    saveNote: vi.fn(),
  };
});

const refresh = vi.fn();

vi.mock("next/navigation", () => {
  return {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix -- this is okay
    useRouter: () => {
      return { refresh };
    },
  };
});

describe("<NewNoteInput />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show a validation error if submitted empty", async () => {
    render(<NewNoteInput />);
    const input = screen.getByPlaceholderText(/what's on your mind/i);

    await userEvent.type(input, "{enter}");
    await expect(
      screen.findByText(/note cannot be empty/i),
    ).resolves.toBeInTheDocument();
  });

  it("should call saveNote and refresh on successful submit", async () => {
    const { saveNote } = await import("@/actions/save-note");

    render(<NewNoteInput />);

    const input = screen.getByPlaceholderText(/what's on your mind/i);

    await userEvent.type(input, "Test note{enter}");

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith("Test note", "thought");
    });

    expect(refresh).toHaveBeenCalledWith();

    expect(input).toHaveValue("");
  });

  it("should allow changing kind from dropdown", async () => {
    globalThis.HTMLElement.prototype.hasPointerCapture = vi.fn();

    render(<NewNoteInput />);

    const trigger = screen.getByRole("combobox", { name: /Select Kind/i });

    await userEvent.click(trigger);

    const secondKind = KIND_VALUES[1];

    await userEvent.click(
      screen.getByRole("option", { name: KIND_LABELS[secondKind] }),
    );

    const input = screen.getByPlaceholderText(/what's on your mind/i);

    await userEvent.type(input, "Another note{enter}");

    const { saveNote } = await import("@/actions/save-note");

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith("Another note", secondKind);
    });
  });

  it("should disable input and dropdown while submitting", async () => {
    const { saveNote } = vi.mocked(await import("@/actions/save-note"));

    saveNote.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    render(<NewNoteInput />);

    const input = screen.getByPlaceholderText(/what's on your mind/i);
    const combobox = screen.getByRole("combobox");

    await userEvent.type(input, "Delayed note{enter}");

    expect(input).toBeDisabled();
    expect(combobox).toBeDisabled();

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith("Delayed note", "thought");
    });
  });

  it("should prevent double submissions", async () => {
    const { saveNote } = vi.mocked(await import("@/actions/save-note"));

    saveNote.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    render(<NewNoteInput />);

    const input = screen.getByPlaceholderText(/what's on your mind/i);

    await userEvent.type(input, "Double submit test{enter}");
    await userEvent.type(input, "{enter}");

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledTimes(1);
    });
  });
});
