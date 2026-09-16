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

  it("should highlight the matched text in the title", () => {
    render(
      <NoteLabel
        note={{
          createdAt: new Date(0),
          folder: "",
          path: "needle.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "[[hl]]Needle[[/hl]] list",
          updatedAt: new Date(0),
        }}
      />
    );

    expect(screen.getByText("Needle").tagName).toBe("MARK");
    expect(screen.getByTitle("needle.md")).toHaveTextContent("Needle list");
  });
});
