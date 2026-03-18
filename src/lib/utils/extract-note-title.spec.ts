import { extractNoteTitle } from "./extract-note-title";

describe("extractNoteTitle", () => {
  it("should return a plain single-line note as-is", () => {
    expect(extractNoteTitle("just a plain note")).toBe("just a plain note");
  });

  it("should return the first line of a multi-line note", () => {
    expect(extractNoteTitle("first line\nsecond line\nthird line")).toBe(
      "first line",
    );
  });

  it("should skip blank leading lines and use the first non-empty line", () => {
    expect(extractNoteTitle("\n\nactual content\nmore content")).toBe(
      "actual content",
    );
  });

  it("should strip markdown heading from the first line", () => {
    expect(extractNoteTitle("# My note title\nsome body text")).toBe(
      "My note title",
    );
  });

  it("should strip bold markdown from the first line", () => {
    expect(extractNoteTitle("**important note**\nbody")).toBe("important note");
  });

  it("should strip inline code from the first line", () => {
    expect(extractNoteTitle("`code title`\nbody")).toBe("code title");
  });

  it("should truncate a very long first line at a word boundary", () => {
    const longLine =
      "this is a very long first line that goes well beyond eighty characters in total length";
    const result = extractNoteTitle(longLine);

    expect(result.endsWith("...")).toBe(true);
    // 80 chars + "..."
    expect(result.length).toBeLessThanOrEqual(83);
  });

  it("should handle an empty string", () => {
    expect(extractNoteTitle("")).toBe("");
  });

  it("should handle a note with only whitespace on the first line", () => {
    expect(extractNoteTitle("   \nreal content")).toBe("real content");
  });
});
