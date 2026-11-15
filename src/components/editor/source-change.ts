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

/** The line standing where `row` stands, when the two line up. */
function alignedRow(before: string[], source: string[], row: number) {
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

/** Nothing on the row but space, a quote's markers, or a setext underline. */
const BLANK_ROW = /^[\s>]*(?:=+|-+)?\s*$/u;

function filledRows(lines: string[]) {
  return lines.flatMap((line, index) =>
    BLANK_ROW.test(line)
      ? []
      : [{ index, text: line.replaceAll(/[\s#]/gu, "") }]
  );
}

/**
 * The source line standing where `row` stands. A render can drop the file's
 * blank lines, pad its rows, and write a setext heading on one `#` row, which
 * anchors a diff on the wrong line, so rows that do not line up are compared
 * without any of those.
 */
function sourceRow(before: string[], source: string[], row: number) {
  const aligned = alignedRow(before, source, row);

  if (aligned !== null) {
    return aligned;
  }

  const rows = filledRows(before);
  const sourceRows = filledRows(source);

  const filled = alignedRow(
    rows.map(({ text }) => text),
    sourceRows.map(({ text }) => text),
    rows.findIndex(({ index }) => index === row)
  );

  return filled === null ? null : (sourceRows[filled]?.index ?? null);
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

/** A line holding only a list marker. */
const BARE_MARKER = /(?:^|\n)[\t >]*(?:[-+*]|\d{1,9}[.)])$/u;

/**
 * `text` with `from` to `to` replaced by `inserted`, in each spelling the line
 * can take. A line holding only a list marker is either an empty item, whose
 * text needs a space after the marker, or a line of paragraph text, which
 * takes it as is. Only a parse tells the two apart.
 */
export function splices(
  text: string,
  from: number,
  to: number,
  inserted: string
): string[] {
  const head = text.slice(0, from);
  const tail = text.slice(to);

  const afterMarker =
    /^\S/u.test(inserted) &&
    BARE_MARKER.test(head) &&
    /^(?:\n|$)/u.test(text.slice(from));

  return afterMarker
    ? [head + inserted + tail, `${head} ${inserted}${tail}`]
    : [head + inserted + tail];
}

/** Where `source` takes the change that turns `before` into `after`. */
function sourceChange(source: string, before: string, after: string) {
  const change = changedRange(before, after);

  // A replacement leaves alone what only the source has in front of it.
  const from = sourceOffset(
    before,
    source,
    change.from,
    change.to > change.from
  );

  const to = sourceOffset(before, source, change.to, false);

  return from === null || to === null ? null : { from, text: change.text, to };
}

/** A pipe after an even run of backslashes, which leave it unescaped. */
const PIPE = /(?<=(?:^|[^\\])(?:\\\\)*)\|/u;

/** A row's indent and quote markers. */
const ROW_PREFIX = /^[\s>]*/u;

/** A table row's cells, as their text without padding and where it sits. */
function cellsOf(row: string) {
  const start = row.length - row.replace(ROW_PREFIX, "").length;
  const segments = row.slice(start).split(PIPE);

  const cells = segments.map((segment, index) => {
    const end = start + segments.slice(0, index + 1).join("|").length;
    const text = segment.trim();
    const from = end - segment.trimStart().length;

    return { from, text, to: from + text.length };
  });

  const leading = row.slice(start).startsWith("|") ? 1 : 0;

  const trailing =
    segments.length > 1 && segments.at(-1)?.trim() === "" ? 1 : 0;

  return cells.slice(leading, cells.length - trailing);
}

/** A delimiter row's cell, whose dashes only pad its column. */
const DELIMITER_CELL = /^(?<left>:?)-+(?<right>:?)$/u;

function unpadded(cell: string) {
  return cell.replace(DELIMITER_CELL, "$<left>-$<right>");
}

function isDelimiterRow(line: string) {
  return (
    PIPE.test(line) &&
    cellsOf(line).every(({ text }) => DELIMITER_CELL.test(text))
  );
}

/** A line the render writes as a table row, which it opens with a pipe. */
const RENDERED_ROW = /^[\s>]*\|/u;

/**
 * The lines of a render that are table rows, each marked when it is the
 * delimiter row. A table opens on a row over a delimiter row and runs while
 * its lines open with a pipe. A pipe in a paragraph splits no cells, and a
 * body row can hold only dashes, so neither is judged by its text alone.
 */
function tableRows(lines: string[]) {
  const rows = new Map<number, boolean>();

  for (const [row, line] of lines.entries()) {
    const header = lines[row - 1];

    if (
      header !== undefined &&
      !rows.has(row - 1) &&
      RENDERED_ROW.test(header) &&
      isDelimiterRow(line)
    ) {
      const body = lines.slice(row + 1);
      const end = body.findIndex((next) => !RENDERED_ROW.test(next));
      const last = row + (end === -1 ? body.length : end);

      rows.set(row - 1, false);
      rows.set(row, true);

      for (let next = row + 1; next <= last; next += 1) {
        rows.set(next, false);
      }
    }
  }

  return rows;
}

interface EditedCell {
  column: number;
  now: string;
  row: number;
  was: string;
}

/**
 * The cells an edit changed, when it changed only the text of table cells. A
 * render pads every cell to its column's widest, so a cell that grows changes
 * the padding of every row.
 */
function editedCells(before: string[], after: string[]) {
  const table = tableRows(before);

  const rows = before.flatMap((line, row) => {
    const edited = after[row];

    return edited === undefined || edited === line
      ? []
      : [{ cells: cellsOf(line), edited: cellsOf(edited), row }];
  });

  const onlyCells =
    before.length === after.length &&
    rows.every(
      ({ cells, edited, row }) =>
        table.has(row) && cells.length === edited.length
    );

  return onlyCells
    ? rows.flatMap(({ cells, edited, row }) => {
        const delimiter = table.get(row) === true;

        return cells.flatMap((cell, column) => {
          const now = edited[column];

          if (now === undefined) {
            return [];
          }

          const same = delimiter
            ? unpadded(cell.text) === unpadded(now.text)
            : cell.text === now.text;

          return same ? [] : [{ column, now: now.text, row, was: cell.text }];
        });
      })
    : [];
}

/** `rows` with one cell's change made in the cell of the file standing there. */
function carryCell(
  rows: string[],
  lines: string[],
  sourceLines: string[],
  { column, now, row, was }: EditedCell
) {
  const at = sourceRow(lines, sourceLines, row);
  const line = at === null ? undefined : rows[at];
  const cell = line === undefined ? undefined : cellsOf(line)[column];

  if (at === null || line === undefined || cell === undefined) {
    return null;
  }

  const change = sourceChange(line.slice(cell.from, cell.to), was, now);

  return change === null
    ? null
    : rows.with(
        at,
        line.slice(0, cell.from + change.from) +
          change.text +
          line.slice(cell.from + change.to)
      );
}

/** `source` with each cell's change made in the cell of the file standing there. */
function carryCells(source: string, lines: string[], cells: EditedCell[]) {
  const sourceLines = source.split("\n");
  let rows = sourceLines;

  for (const cell of cells) {
    const carried = carryCell(rows, lines, sourceLines, cell);

    if (carried === null) {
      return null;
    }

    rows = carried;
  }

  return rows.join("\n");
}

/**
 * The ways `source` can make the change that turns `before` into `after`,
 * where `before` is another spelling of the same markdown, so a parse can
 * pick the one that reads back. A table's change is made cell by cell, since
 * the padding it moves is the render's alone. Empty when the change touches
 * text the two spellings do not share.
 */
export function carriedSpellings(
  source: string,
  before: string,
  after: string
): string[] {
  const lines = before.split("\n");
  const cells = editedCells(lines, after.split("\n"));

  if (cells.length > 0) {
    const carried = carryCells(source, lines, cells);

    return carried === null ? [] : [carried];
  }

  const change = sourceChange(source, before, after);

  return change === null
    ? []
    : splices(source, change.from, change.to, change.text);
}

function rowIndent(line: string | undefined) {
  return /^[\s>]*/u.exec(line ?? "")?.[0];
}

/**
 * Whether the rows a carry rewrote stand at the indent of the rows they
 * replaced. A carry writes the render's indent, which the file can spell
 * differently, and an external reader leaves a row out of its table or list
 * at any other indent. A change inside one row leaves that row's indent be.
 */
export function keepsRowIndents(source: string, carried: string) {
  const sourceLines = source.split("\n");
  const lines = carried.split("\n");

  return spans(sourceLines, lines).every(
    ({ from, length, sourceFrom, sourceLength }) =>
      (length === 1 && sourceLength === 1) ||
      lines
        .slice(sourceFrom, sourceFrom + sourceLength)
        .every(
          (line) =>
            rowIndent(line) ===
            rowIndent(sourceLines[Math.min(from, sourceLines.length - 1)])
        )
  );
}
