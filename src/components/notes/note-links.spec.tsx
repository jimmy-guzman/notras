import { describe, expect, it } from "vitest";

import type { SelectLink } from "@/server/db/schemas/links";

import { toLinkId, toNoteId } from "@/lib/id";
import { render, screen } from "@/testing/utils";

import { NoteLinks } from "./note-links";

const NOTE_ID = toNoteId("note_01h455vb4pex5vsknk084sn02q");
const USER_ID = "device";

function createLink(url: string, overrides?: Partial<SelectLink>): SelectLink {
  return {
    createdAt: new Date(2025, 5, 15),
    description: null,
    id: toLinkId("link_01h455vb4pex5vsknk084sn02q"),
    noteId: NOTE_ID,
    title: null,
    url,
    userId: USER_ID,
    ...overrides,
  };
}

describe("NoteLinks", () => {
  it("should render nothing when links array is empty", () => {
    render(<NoteLinks links={[]} />);

    expect(screen.queryByText("links")).not.toBeInTheDocument();
  });

  it("should render link title as clickable anchor", () => {
    const links = [
      createLink("https://example.com", { title: "Example Site" }),
    ];

    render(<NoteLinks links={links} />);

    const anchor = screen.getByRole("link", { name: /example site/i });

    expect(anchor).toHaveAttribute("href", "https://example.com");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should fall back to raw URL when title is null", () => {
    const links = [createLink("https://example.com")];

    render(<NoteLinks links={links} />);

    const anchor = screen.getByRole("link", {
      name: /https:\/\/example\.com/,
    });

    expect(anchor).toHaveAttribute("href", "https://example.com");
  });

  it("should render multiple links", () => {
    const links = [
      createLink("https://a.com", {
        id: toLinkId("link_00000000000000000000000001"),
        title: "Site A",
      }),
      createLink("https://b.com", {
        id: toLinkId("link_00000000000000000000000002"),
        title: "Site B",
      }),
    ];

    render(<NoteLinks links={links} />);

    expect(screen.getByRole("link", { name: /site a/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /site b/i })).toBeInTheDocument();
  });

  it("should render the links heading", () => {
    const links = [createLink("https://example.com")];

    render(<NoteLinks links={links} />);

    expect(screen.getByText("links")).toBeInTheDocument();
  });
});
