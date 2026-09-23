import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";

describe("note warnings", () => {
  it("should show committed-write warnings without a workspace or index query", async () => {
    render(createElement(Toaster));
    act(() => {
      reportNoteWarnings([
        {
          kind: "index",
          message: "the index is read-only",
          path: "inbox/jot.md",
        },
        { kind: "cleanup", message: "Permission denied", path: "old.md" },
      ]);
    });
    expect(
      screen.getByText("could not update search for inbox/jot.md")
    ).toBeInTheDocument();
    expect(screen.getByText("the index is read-only")).toBeInTheDocument();
    expect(
      screen.getByText("could not remove the original note old.md")
    ).toBeInTheDocument();
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});
