import { diff3Merge } from "node-diff3";

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
  regions: ReviewRegion[];
}

export type MergeResult = { content: string; kind: "merged" } | MergeConflict;

export type HunkChoice = "ours" | "theirs" | { edited: string };

function lines(text: string) {
  return text.split("\n");
}

function chosenLines(hunk: Hunk, choice: HunkChoice) {
  if (choice === "ours") {
    return hunk.ours;
  }

  if (choice === "theirs") {
    return hunk.theirs;
  }

  // An empty result is the place deleted, not one blank line.
  return choice.edited === "" ? [] : lines(choice.edited);
}

/**
 * Combine two edits of one base three ways. Lines are the unit, and identical
 * changes on both sides are not a conflict.
 */
export function mergeDocuments(
  ours: string,
  base: string,
  theirs: string
): MergeResult {
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

    throw new Error("A merge region without a side");
  });

  if (regions.every((region) => region.kind === "ok")) {
    return {
      content: regions
        .flatMap((region) => (region.kind === "ok" ? region.lines : []))
        .join("\n"),
      kind: "merged",
    };
  }

  return { kind: "conflict", regions };
}

/** The document a review produces once every hunk has a choice. */
export function composeResolution(
  conflict: MergeConflict,
  choices: HunkChoice[]
): string {
  const hunks = conflict.regions.filter((region) => region.kind === "hunk");

  if (choices.length !== hunks.length) {
    throw new Error("Every hunk needs a choice");
  }

  let next = 0;
  const output: string[] = [];

  for (const region of conflict.regions) {
    if (region.kind === "ok") {
      output.push(...region.lines);
      continue;
    }

    const choice = choices[next];
    next += 1;

    if (choice === undefined) {
      throw new Error("Every hunk needs a choice");
    }

    output.push(...chosenLines(region, choice));
  }

  return output.join("\n");
}
