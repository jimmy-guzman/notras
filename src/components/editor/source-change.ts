import { diffIndices } from "node-diff3";

function spans(before: string[], source: string[]) {
  return diffIndices(before, source).map((hunk) => {
    const [from, length]: number[] = hunk.buffer1;
    const [sourceFrom, sourceLength]: number[] = hunk.buffer2;
    if (
      from === undefined ||
      length === undefined ||
      sourceFrom === undefined ||
      sourceLength === undefined
    ) {
      throw new Error("The diff returned a hunk without a range");
    }
    return { from, length, sourceFrom, sourceLength };
  });
}

/** The source line standing where `row` stands, when the two line up. */
function sourceRow(before: string[], source: string[], row: number) {
  let shift = 0;
  for (const span of spans(before, source)) {
    if (row < span.from) {
      break;
    }
    if (row < span.from + span.length) {
      return span.length === span.sourceLength
        ? span.sourceFrom + row - span.from
        : null;
    }
    shift = span.sourceFrom + span.sourceLength - span.from - span.length;
  }
  return row + shift;
}

/**
 * The source column a caret at `column` sits at, unless it is inside text the
 * two lines do not share. Text only the source has at that column stays
 * ahead of the caret, or behind it when `past`.
 */
function sourceColumn(
  before: string,
  source: string,
  column: number,
  past: boolean
) {
  let shift = 0;
  for (const span of spans(before.split(""), source.split(""))) {
    if (
      column < span.from ||
      (column === span.from && !(past && span.length === 0))
    ) {
      break;
    }
    if (column < span.from + span.length) {
      return null;
    }
    shift = span.sourceFrom + span.sourceLength - span.from - span.length;
  }
  return column + shift;
}

function sourceOffset(
  before: string,
  source: string,
  offset: number,
  past: boolean
) {
  const lines = before.split("\n");
  const sourceLines = source.split("\n");
  const above = before.slice(0, offset).split("\n");
  const row = above.length - 1;
  const at = sourceRow(lines, sourceLines, row);
  const line = lines[row];
  const sourceLine = at === null ? undefined : sourceLines[at];
  if (at === null || line === undefined || sourceLine === undefined) {
    return null;
  }
  const column = sourceColumn(line, sourceLine, above[row]?.length ?? 0, past);
  return column === null
    ? null
    : sourceLines
        .slice(0, at)
        .reduce((length, earlier) => length + earlier.length + 1, column);
}

/** The one span of `before` that differs from `after`, and what replaces it. */
export function changedRange(before: string, after: string) {
  let from = 0;
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  ) {
    from += 1;
  }
  let to = before.length;
  let end = after.length;
  while (to > from && end > from && before[to - 1] === after[end - 1]) {
    to -= 1;
    end -= 1;
  }
  return { from, text: after.slice(from, end), to };
}

/**
 * Make in `source` the change that turns `before` into `after`, where
 * `before` is another spelling of the same markdown. Null when the
 * change touches text the two spellings do not share.
 */
export function carryChange(
  source: string,
  before: string,
  after: string
): string | null {
  const change = changedRange(before, after);
  // A replacement leaves alone what only the source has in front of it.
  const from = sourceOffset(
    before,
    source,
    change.from,
    change.to > change.from
  );
  const to = sourceOffset(before, source, change.to, false);
  return from === null || to === null
    ? null
    : source.slice(0, from) + change.text + source.slice(to);
}
