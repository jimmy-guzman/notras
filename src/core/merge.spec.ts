import { describe, expect, it } from "vitest";
import { composeResolution, mergeDocuments } from "@/core/merge";

const base = "# Plan\n\nfirst paragraph\n\nsecond paragraph\n";

describe("three-way merge", () => {
  it("should combine edits in separate paragraphs", () => {
    const ours = "# Plan\n\nfirst paragraph, mine\n\nsecond paragraph\n";
    const theirs = "# Plan\n\nfirst paragraph\n\nsecond paragraph, theirs\n";

    expect(mergeDocuments(ours, base, theirs)).toEqual({
      content: "# Plan\n\nfirst paragraph, mine\n\nsecond paragraph, theirs\n",
      kind: "merged",
    });
  });

  it("should report overlapping edits as one hunk carrying both sides and the base", () => {
    const ours = "# Plan\n\nfirst paragraph, mine\n\nsecond paragraph\n";
    const theirs = "# Plan\n\nfirst paragraph, theirs\n\nsecond paragraph\n";

    const result = mergeDocuments(ours, base, theirs);

    expect(result).toEqual({
      kind: "conflict",
      newline: "\n",
      regions: [
        { kind: "ok", lines: ["# Plan", ""] },
        {
          base: ["first paragraph"],
          kind: "hunk",
          ours: ["first paragraph, mine"],
          theirs: ["first paragraph, theirs"],
        },
        { kind: "ok", lines: ["", "second paragraph", ""] },
      ],
    });
  });

  it("should accept identical edits on both sides without a hunk", () => {
    const both = "# Plan\n\nfirst paragraph, same\n\nsecond paragraph\n";

    expect(mergeDocuments(both, base, both)).toEqual({
      content: both,
      kind: "merged",
    });
  });

  it("should keep a trailing newline through a merge", () => {
    const ours = "# Plan\n\nfirst paragraph\n\nsecond paragraph\n\nmine\n";
    const theirs = "# Plan\n\nfirst paragraph\n\nsecond paragraph";

    const result = mergeDocuments(ours, base, theirs);

    expect(result.kind).toBe("conflict");
    expect(mergeDocuments(ours, base, base)).toEqual({
      content: ours,
      kind: "merged",
    });
  });

  it("should join with the line ending of the file on disk", () => {
    const crlfBase = base.replaceAll("\n", "\r\n");
    const ours = "# Plan\n\nfirst paragraph, mine\n\nsecond paragraph\n";
    const theirs = crlfBase.replace(
      "second paragraph",
      "second paragraph, theirs"
    );

    expect(mergeDocuments(ours, crlfBase, theirs)).toEqual({
      content:
        "# Plan\r\n\r\nfirst paragraph, mine\r\n\r\nsecond paragraph, theirs\r\n",
      kind: "merged",
    });
  });

  it("should compose a resolution from per-hunk choices and edited text", () => {
    const ours = "# Plan\n\nfirst, mine\n\nsecond, mine\n";
    const theirs = "# Plan\n\nfirst, theirs\n\nsecond, theirs\n";
    const result = mergeDocuments(ours, base, theirs);
    if (result.kind !== "conflict") {
      throw new Error("expected a conflict");
    }

    expect(
      composeResolution(result, ["theirs", { edited: "second, both\nlines" }])
    ).toBe("# Plan\n\nfirst, theirs\n\nsecond, both\nlines\n");
    expect(composeResolution(result, ["ours", "ours"])).toBe(ours);
  });

  it("should delete a place whose result is empty", () => {
    const result = mergeDocuments(
      "a\nmine\nz\n",
      "a\nbase\nz\n",
      "a\ntheirs\nz\n"
    );
    if (result.kind !== "conflict") {
      throw new Error("expected a conflict");
    }

    expect(composeResolution(result, [{ edited: "" }])).toBe("a\nz\n");
  });

  it("should refuse a resolution that leaves a hunk unchosen", () => {
    const result = mergeDocuments("a\nmine\n", "a\nbase\n", "a\ntheirs\n");
    if (result.kind !== "conflict") {
      throw new Error("expected a conflict");
    }

    expect(() => composeResolution(result, [])).toThrow(
      "every hunk needs a choice"
    );
  });
});
