import { describe, expect, it } from "vitest";
import { headingRange, renameDocument } from "./retitle-buffer";

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
  it("should locate the heading after frontmatter and blank lines", () => {
    const text = "---\ntitle: imported\n---\n\n# Errands\n\nbody";
    const range = headingRange(text);
    expect(text.slice(range?.from, range?.to)).toBe("# Errands");
  });
  it("should leave prose and code without a naming heading", () => {
    expect(headingRange("body\n# later")).toBeUndefined();
    expect(headingRange("```md\n# code\n```")).toBeUndefined();
  });
});
