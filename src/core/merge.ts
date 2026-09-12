import { diff3Merge } from "node-diff3";

export type Newline = "\n" | "\r\n";

export interface Hunk {
  base: string[];
  ours: string[];
  theirs: string[];
}

export type ReviewRegion =
  | { kind: "ok"; lines: string[] }
  | ({ kind: "hunk" } & Hunk);

export interface MergeConflict {
  kind: "conflict";
  newline: Newline;
  regions: ReviewRegion[];
}

export type MergeResult = { content: string; kind: "merged" } | MergeConflict;

const LINE_BREAK = /\r?\n/;

function lines(text: string) {
  return text.split(LINE_BREAK);
}

function newlineOf(text: string): Newline {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Combine two edits of one base three ways. Lines are the unit, the disk's line
 * ending wins, and identical changes on both sides are not a conflict.
 */
export function mergeDocuments(
  ours: string,
  base: string,
  theirs: string
): MergeResult {
  const newline = newlineOf(theirs);
  const regions: ReviewRegion[] = diff3Merge(
    lines(ours),
    lines(base),
    lines(theirs),
    { excludeFalseConflicts: true }
  ).map((region) => {
    if (region.ok !== undefined) {
      return { kind: "ok", lines: region.ok };
    }
    if (region.conflict !== undefined) {
      return {
        base: region.conflict.o,
        kind: "hunk",
        ours: region.conflict.a,
        theirs: region.conflict.b,
      };
    }
    throw new Error("a merge region without a side");
  });

  if (regions.every((region) => region.kind === "ok")) {
    return {
      content: regions
        .flatMap((region) => (region.kind === "ok" ? region.lines : []))
        .join(newline),
      kind: "merged",
    };
  }

  return { kind: "conflict", newline, regions };
}
