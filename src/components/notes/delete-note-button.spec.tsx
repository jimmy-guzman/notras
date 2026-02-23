import { userEvent } from "@testing-library/user-event";

import type { NoteId } from "@/lib/id";

import { toNoteId } from "@/lib/id";
import { render, screen, within } from "@/testing/utils";

import { DeleteNoteButton } from "./delete-note-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/actions/delete-note", () => ({
  deleteNote: vi.fn(),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

const noteId: NoteId = toNoteId("note_abc123");

describe("DeleteNoteButton", () => {
  it("should render a delete button", () => {
    render(<DeleteNoteButton noteId={noteId} />);

    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("should open a confirmation dialog when clicked", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("alertdialog");

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/delete note/i)).toBeInTheDocument();
  });

  it("should show cancel and delete actions in the dialog", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("alertdialog");

    expect(
      within(dialog).getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /delete/i }),
    ).toBeInTheDocument();
  });

  it("should close the dialog when cancel is clicked", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("should show a warning that the action cannot be undone", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("alertdialog");

    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("should display a keyboard shortcut hint", () => {
    render(<DeleteNoteButton noteId={noteId} />);

    expect(screen.getByText("d")).toBeInTheDocument();
  });
});
