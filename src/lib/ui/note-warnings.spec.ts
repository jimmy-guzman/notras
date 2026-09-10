import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { expect, it } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";

it("should show committed-write warnings without a workspace or index query", async () => {
  render(createElement(Toaster));
  await act(() => {
    reportNoteWarnings([
      {
        kind: "index",
        message: "the index is read-only",
        path: "inbox/jot.md",
      },
      { kind: "cleanup", message: "permission denied", path: "old.md" },
    ]);
  });
  expect(screen.getByText("could not update search")).toBeInTheDocument();
  expect(
    screen.getByText("inbox/jot.md: the index is read-only")
  ).toBeInTheDocument();
  expect(
    screen.getByText("could not remove the original note")
  ).toBeInTheDocument();
  expect(screen.getByText("old.md: permission denied")).toBeInTheDocument();
});
