import type { Node, NodeRange, ResolvedPos } from "@tiptap/pm/model";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";

/** The item type each list holds, which decides what a drop into one becomes. */
const LIST_ITEM_TYPE: Readonly<Record<string, string>> = {
  bulletList: "listItem",
  orderedList: "listItem",
  taskList: "taskItem",
};

function isListItem(node: Node) {
  return node.type.name === "listItem" || node.type.name === "taskItem";
}

/** Containers a range widens out of: the bullet, not the paragraph inside it. */
const WIDEN_OUT_OF = new Set([
  "listItem",
  "tableCell",
  "tableHeader",
  "tableRow",
  "taskItem",
]);

/** A table's header row, which markdown requires to stay first. */
function isHeaderRow(row: Node) {
  for (let index = 0; index < row.childCount; index += 1) {
    if (row.child(index).type.name === "tableHeader") {
      return true;
    }
  }

  return false;
}

function isRowRange(range: NodeRange) {
  return range.parent.type.name === "table";
}

/** The depth of the table around `$pos`, or null outside one. */
function tableDepth($pos: ResolvedPos) {
  const { depth: from } = $pos;

  for (let depth = from; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") {
      return depth;
    }
  }

  return null;
}

/** The blocks a range covers, as their own siblings. */
function fragmentOf(range: NodeRange) {
  const children: Node[] = [];

  for (let index = range.startIndex; index < range.endIndex; index += 1) {
    children.push(range.parent.child(index));
  }

  return Fragment.fromArray(children);
}

/**
 * Reshape one block for the container it lands in, one level only. `listItem`
 * and `taskItem` declare the same content expression, so re-typing an item
 * between the two list families always produces valid content.
 */
function adaptBlock(node: Node, $target: ResolvedPos) {
  const { parent } = $target;
  const index = $target.index();

  if (parent.canReplaceWith(index, index, node.type)) {
    return Fragment.from(node);
  }

  const itemName = LIST_ITEM_TYPE[parent.type.name];
  const itemType =
    itemName === undefined ? undefined : parent.type.schema.nodes[itemName];

  if (itemType !== undefined) {
    const content = isListItem(node) ? node.content : Fragment.from(node);

    if (itemType.validContent(content)) {
      return Fragment.from(itemType.create(null, content));
    }
  }

  // An item with no list to land in gives up its wrapper, so a bullet dragged
  // into the body reads as the paragraph it looked like.
  if (isListItem(node)) {
    return node.content;
  }

  return Fragment.from(node);
}

function adaptFragment(fragment: Fragment, $target: ResolvedPos) {
  let adapted = Fragment.empty;

  for (let index = 0; index < fragment.childCount; index += 1) {
    adapted = adapted.append(adaptBlock(fragment.child(index), $target));
  }

  return adapted;
}

/**
 * A gap between the items of the nearest list around `pos`, or null outside
 * every list. An item is a container the schema would happily nest a paragraph
 * in, so aiming at the raw position drops blocks inside the item they were
 * dropped on. The fallback for a position that arrives unresolved.
 */
function itemBoundary($pos: ResolvedPos) {
  const { depth: from, pos } = $pos;

  for (let depth = from; depth > 0; depth -= 1) {
    if (LIST_ITEM_TYPE[$pos.node(depth).type.name] === undefined) {
      continue;
    }

    if (depth >= from) {
      // Already between items rather than inside one.
      return pos;
    }

    const middle = ($pos.start(depth + 1) + $pos.end(depth + 1)) / 2;

    return pos <= middle ? $pos.before(depth + 1) : $pos.after(depth + 1);
  }

  return null;
}

/**
 * The position a drop should actually use. A row never leaves its own table,
 * and nothing else lands between rows: a drop aimed inside one steps out to the
 * table's own edge. Null refuses the drop.
 */
function tableAware(doc: Node, range: NodeRange, pos: number): null | number {
  const $pos = doc.resolve(pos);
  const depth = tableDepth($pos);

  if (isRowRange(range)) {
    const start = range.$from.start(range.depth);
    const header = range.parent.child(0);
    // The first row is the one markdown writes as the header, so the gap above
    // it is nowhere a row can land. `stepTarget` holds the same floor.
    const floor = isHeaderRow(header) ? start + header.nodeSize : start;

    return pos >= floor && pos <= range.$from.end(range.depth) ? pos : null;
  }

  if (depth === null) {
    return pos;
  }

  const middle = ($pos.start(depth) + $pos.end(depth)) / 2;

  return pos <= middle ? $pos.before(depth) : $pos.after(depth);
}

/** What the move would insert, and the position it would insert it at. */
function planMove(doc: Node, range: NodeRange, pos: number) {
  const aimed = tableAware(doc, range, pos);

  if (aimed === null) {
    return null;
  }

  const blocks = fragmentOf(range);
  const beside = itemBoundary(doc.resolve(aimed));

  // Inside a list the gap between items is the answer, and `dropPoint` must not
  // be given the chance to escalate out of it: handed a `listItem` a `taskList`
  // cannot hold, it would walk out to the document and the item would arrive as
  // a paragraph rather than being re-typed into a task.
  if (beside !== null) {
    const content = adaptFragment(blocks, doc.resolve(beside));

    return { at: beside, content, slice: new Slice(content, 0, 0) };
  }

  // Outside every list, ask where the blocks fit as they actually are, then
  // reshape for whatever container that answer landed in. Reshaping first
  // poisons the search, which is what stripped a dropped task of its checkbox.
  const at = dropPoint(doc, aimed, new Slice(blocks, 0, 0)) ?? aimed;
  const content = adaptFragment(blocks, doc.resolve(at));

  return { at, content, slice: new Slice(content, 0, 0) };
}

/**
 * The sibling gap one step up or down. With no sibling that way the gap is the
 * parent's own edge, so the first item in a list steps out to sit before the
 * list rather than stopping. Null at the document's edge.
 */
function stepTarget(range: NodeRange, back: boolean) {
  const sibling = back
    ? range.parent.maybeChild(range.startIndex - 1)
    : range.parent.maybeChild(range.endIndex);

  // A row has nowhere to go but another row's place: stepping past the last one
  // would take it out of the table, and stepping past the first would put it
  // above the header markdown needs kept first.
  if (isRowRange(range)) {
    if (sibling === null || (back && isHeaderRow(sibling))) {
      return null;
    }

    return back ? range.start - sibling.nodeSize : range.end + sibling.nodeSize;
  }

  if (sibling !== null) {
    return back ? range.start - sibling.nodeSize : range.end + sibling.nodeSize;
  }

  if (range.depth === 0) {
    return null;
  }

  return back ? range.$from.before(range.depth) : range.$to.after(range.depth);
}

/**
 * The whole blocks a selection moves. `blockRange` stops at the paragraph
 * inside a bullet, so widening out of the item is what makes a caret in a
 * bullet mean the bullet, sublist and all.
 */
export function movingRange(doc: Node, selection: Selection): NodeRange | null {
  let range = selection.$from.blockRange(selection.$to);

  while (range !== null && WIDEN_OUT_OF.has(range.parent.type.name)) {
    const { depth } = range;

    range = doc
      .resolve(range.$from.before(depth))
      .blockRange(doc.resolve(range.$to.after(depth)));
  }

  if (range !== null && isRowRange(range)) {
    for (let index = range.startIndex; index < range.endIndex; index += 1) {
      if (isHeaderRow(range.parent.child(index))) {
        return null;
      }
    }
  }

  return range;
}

/**
 * The blocks a drag moves, or null where the selection is about words rather
 * than blocks, which the drag moves as text. Widening two selected words to
 * their paragraph moves more than the highlight promised. Reaching both ends of
 * a textblock, or crossing into another, is what makes a selection about
 * blocks, and so is sitting between blocks at all: a selected rule or a cell
 * selection has no words to be about.
 */
export function dragRange(doc: Node, selection: Selection): NodeRange | null {
  const range = movingRange(doc, selection);

  if (range === null || range.endIndex - range.startIndex > 1) {
    return range;
  }

  const { $from, $to } = selection;

  if (!$from.parent.inlineContent) {
    return range;
  }

  return $from.parentOffset === 0 &&
    $to.parentOffset === $to.parent.content.size
    ? range
    : null;
}

/**
 * Where a drop at `pos` would land `range`, which the indicator draws from.
 * The line and the transaction read it from here so they cannot disagree.
 */
export function dropTarget(
  doc: Node,
  range: NodeRange,
  pos: number
): null | number {
  const plan = planMove(doc, range, pos);

  if (plan === null) {
    return null;
  }

  // Landing inside itself moves nothing, so promise nothing.
  return plan.at > range.start && plan.at < range.end ? null : plan.at;
}

/**
 * Where words dropped at `pos` land, which the mark draws from. `dropPoint`
 * walks out to a position the words fit, and a boundary nothing fits at is
 * kept as it is, since `replaceRange` closes the words into a paragraph of
 * their own there. Null inside the words themselves, where a drop moves
 * nothing.
 */
export function textDropTarget(
  doc: Node,
  from: number,
  to: number,
  pos: number
): null | number {
  const at = dropPoint(doc, pos, doc.slice(from, to)) ?? pos;

  return at > from && at < to ? null : at;
}

/**
 * The transaction moving `range` to the gap at `target`, or null when it would
 * not move. Positions rather than coordinates, so the geometry stays with the
 * caller and this stays testable without a layout engine.
 */
export function moveRange(
  state: EditorState,
  range: NodeRange,
  target: number
): null | Transaction {
  const { doc } = state;

  if (target > range.start && target < range.end) {
    return null;
  }

  const plan = planMove(doc, range, target);

  if (plan === null) {
    return null;
  }

  const { at, content, slice } = plan;
  const { tr } = state;

  // `deleteRange`, not `delete`: its covered-depths pass takes a list along
  // with its last item rather than leaving one that violates `listItem+`.
  tr.deleteRange(range.start, range.end);

  const pos = tr.mapping.map(at);

  tr.replaceRange(pos, pos, slice);

  // Comparing against the original doc rather than the post-deletion one, which
  // is what catches a delete followed by an identical reinsert.
  if (tr.doc.eq(doc)) {
    return null;
  }

  // The selection travels with the blocks rather than being replaced by one
  // covering all of them, so a caret stays a caret and a second `⌥↓` finds the
  // same range.
  const end = Math.min(pos + content.size, tr.doc.content.size);
  const carry = (from: number) =>
    Math.min(Math.max(pos + (from - range.start), pos), end);

  return tr.setSelection(
    TextSelection.between(
      tr.doc.resolve(carry(state.selection.from)),
      tr.doc.resolve(carry(state.selection.to))
    )
  );
}

/**
 * The transaction moving the words between `from` and `to` to `at`, or null
 * when it would not move. The steps are ProseMirror's own drop: delete, map,
 * reinsert, then select what landed. Marks the target refuses are stripped by
 * the fit, so words dropped into a code block arrive plain.
 */
export function moveText(
  state: EditorState,
  from: number,
  to: number,
  at: number
): null | Transaction {
  const { doc, tr } = state;

  if (at > from && at < to) {
    return null;
  }

  const slice = doc.slice(from, to);

  tr.deleteRange(from, to);

  const pos = tr.mapping.map(at);

  tr.replaceRange(pos, pos, slice);

  if (tr.doc.eq(doc)) {
    return null;
  }

  // The insert's own map says where what landed ends: the fit may have closed
  // the words into a paragraph, so the slice's size is not the answer.
  const end = tr.mapping.slice(tr.steps.length - 1).map(pos, 1);

  return tr.setSelection(
    TextSelection.between(tr.doc.resolve(pos), tr.doc.resolve(end))
  );
}

/**
 * Collapse a move's selection to a caret, which a drag does and the keyboard
 * does not: a drag's selection was only what it grabbed, so carrying it past
 * the drop leaves a stray highlight.
 */
export function collapseMove(tr: Transaction): Transaction {
  return tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
}

/**
 * The transaction `⌥↑` and `⌥↓` dispatch: the same move a drag makes, one
 * sibling at a time, over whatever the selection covers.
 */
export function moveRangeByStep(
  state: EditorState,
  back: boolean
): null | Transaction {
  const range = movingRange(state.doc, state.selection);

  if (range === null) {
    return null;
  }

  const target = stepTarget(range, back);

  if (target === null) {
    return null;
  }

  const moved = moveRange(state, range, target);

  if (moved === null) {
    return null;
  }

  // A row is the unit whatever the selection was, and a cross-cell selection
  // paints ragged. No `pointer` meta either way, so the typewriter recenters as
  // it does for any keyboard travel.
  return (isRowRange(range) ? collapseMove(moved) : moved).scrollIntoView();
}
