import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoteLabel } from "./note-label";

describe(NoteLabel, () => {
  it("should say when a note is pinned", () => {
    render(
      <NoteLabel
        note={{
          createdAt: new Date(0),
          folder: "work",
          path: "work/plan.md",
          pinned: true,
          snippet: null,
          tags: [],
          title: "plan",
          updatedAt: new Date(0),
        }}
      />
    );

    expect(screen.getByLabelText("pinned")).toBeInTheDocument();
  });
});
