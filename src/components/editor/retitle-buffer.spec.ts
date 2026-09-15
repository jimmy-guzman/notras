import { describe, expect, it } from "vitest";

import { renameDocument } from "./retitle-buffer";

describe("naming heading", () => {
  it("should preserve frontmatter and body while changing the heading", () => {
    expect(
      renameDocument(
        "---\ntitle: imported\ncustom: keep\n---\n# old\n\nbody",
        "Weekend errands"
      )
    ).toBe(
      "---\ntitle: imported\ncustom: keep\n---\n# Weekend errands\n\nbody"
    );
  });

  it("should introduce a heading for a prose-only note", () => {
    expect(renameDocument("body", "Weekend errands")).toBe(
      "# Weekend errands\n\nbody"
    );
  });
});
