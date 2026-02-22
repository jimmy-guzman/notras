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

const noteId: NoteId = toNoteId("note_abc123");

describe("DeleteNoteButton", () => {
  it("should render a delete button", () => {
    render(<DeleteNoteButton noteId={noteId} />);

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("should open a confirmation dialog when clicked", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Delete note")).toBeInTheDocument();
  });

  it("should show Cancel and Delete actions in the dialog", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");

    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("should close the dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("should show a warning that the action cannot be undone", async () => {
    const user = userEvent.setup();

    render(<DeleteNoteButton noteId={noteId} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");

    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
  });
});
