import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
  MarkdownTokenizer,
} from "@tiptap/core";
import {
  BulletList,
  ListItem,
  OrderedList,
  TaskList,
} from "@tiptap/extension-list";
import { TaskItem } from "@tiptap/extension-task-item";
import type { Attrs } from "@tiptap/pm/model";

import { hasNumber, hasString, isAttrs } from "@/components/editor/attrs";

/** `extend` falls back to the parent for an undefined field. */
const NO_TOKENIZER: MarkdownTokenizer = {
  level: "block",
  name: "none",
  start: () => -1,
  tokenize() {
    // marked falls through to its own list rule.
  },
};

/** marked reads a marker line that ends in a space as a paragraph. */
const MARKER_LINE_SPACES = /(?<=^\S+) +(?=\n)/u;

/** Upstream writes every numbered marker with a period. */
const MARKER_PERIOD = /^(?<marker>\S+)\. /u;

/** The delimiter after the first marker, which GFM fixes for the whole list. */
const LIST_DELIMITER = /^\s*\d+(?<delimiter>[.)])/u;

/** `- [ ]` alone is text to marked, an empty task to GitHub and to the app. */
const BARE_CHECKBOX = /^\[(?<mark>[ xX])\] *$/u;

/**
 * marked puts the checkbox first among an item's blocks in a tight list and
 * first inside its paragraph in a loose one.
 */
function replaceCheckbox(
  tokens: MarkdownToken[],
  replace: (checkbox: MarkdownToken) => MarkdownToken[]
) {
  const [first, ...rest] = tokens;

  if (first?.type === "checkbox") {
    const [next, ...after] = rest;

    return next?.tokens === undefined
      ? rest
      : [{ ...next, tokens: [...replace(first), ...next.tokens] }, ...after];
  }

  const [inline, ...inlineRest] = first?.tokens ?? [];

  if (first === undefined || inline?.type !== "checkbox") {
    return tokens;
  }

  return [{ ...first, tokens: [...replace(inline), ...inlineRest] }, ...rest];
}

interface Task {
  checked: boolean;
  tokens: MarkdownToken[];
}

function taskOf(item: MarkdownToken): null | Task {
  if (item.task === true) {
    return {
      checked: item.checked === true,
      tokens: replaceCheckbox(item.tokens ?? [], () => []),
    };
  }

  const [first, ...rest] = item.tokens ?? [];
  const mark = BARE_CHECKBOX.exec(first?.text ?? "")?.groups?.mark;

  return mark === undefined ? null : { checked: mark !== " ", tokens: rest };
}

function taskItemOf(
  item: MarkdownToken,
  task: Task,
  helpers: MarkdownParseHelpers
) {
  const [parsed] = helpers.parseChildren([{ ...item, tokens: task.tokens }]);

  return { ...parsed, attrs: { checked: task.checked }, type: "taskItem" };
}

function listsOf(items: MarkdownToken[], helpers: MarkdownParseHelpers) {
  const lists: JSONContent[] = [];

  for (const item of items) {
    const task = taskOf(item);
    const type = task === null ? "bulletList" : "taskList";
    const node =
      task === null
        ? helpers.parseChildren([item])
        : [taskItemOf(item, task, helpers)];
    const last = lists.at(-1);

    if (last?.type === type && last.content !== undefined) {
      last.content.push(...node);
    } else {
      lists.push(helpers.createNode(type, undefined, node));
    }
  }

  return lists;
}

/**
 * Upstream writes a paragraph's wrapped lines at the margin, where GFM reads
 * them lazily. The item's content column keeps them as typed.
 */
function withWrappedLines(
  render: (node: JSONContent) => string,
  node: JSONContent,
  helpers: MarkdownRendererHelpers,
  alignToMarker: boolean
) {
  const [first] = node.content ?? [];
  const rendered = render(node);

  if (first === undefined) {
    return rendered;
  }

  // The first block alone renders as the marker followed by that block.
  const lead = render({ ...node, content: [first] });
  const head = helpers.renderChildren([first]);
  const prefix = lead.slice(0, lead.length - head.length);
  const configured = helpers.indent("");
  const indent =
    alignToMarker && configured.length < prefix.length
      ? " ".repeat(prefix.length)
      : configured;

  return (
    prefix + head.replaceAll("\n", `\n${indent}`) + rendered.slice(lead.length)
  );
}

/**
 * TODO: drop the parser once `@tiptap/extension-list` leads an item with a
 * paragraph. Through 3.31.3 an item can open with a table, fence, quote or
 * list, which the schema rejects.
 */
export const NoteListItem = ListItem.extend({
  // Only `1. [ ] x` brings a checkbox here, and the schema has no numbered
  // task, so it stays text.
  parseMarkdown(token, helpers) {
    const tokens = replaceCheckbox(token.tokens ?? [], (checkbox) => [
      { raw: checkbox.raw, text: checkbox.raw, type: "text" },
    ]);
    const item =
      ListItem.config.parseMarkdown?.({ ...token, tokens }, helpers) ?? [];

    if (Array.isArray(item) || item.content?.[0]?.type === "paragraph") {
      return item;
    }

    return {
      ...item,
      content: [{ type: "paragraph" }, ...(item.content ?? [])],
    };
  },
  renderMarkdown(node, helpers, context) {
    const rendered = withWrappedLines(
      (item) => ListItem.config.renderMarkdown?.(item, helpers, context) ?? "",
      node,
      helpers,
      context.parentType === "orderedList"
    );
    const parentAttrs: unknown = context.meta?.parentAttrs;

    return (
      isAttrs(parentAttrs) &&
      hasString(parentAttrs, "delimiter") &&
      parentAttrs.delimiter === ")"
        ? rendered.replace(MARKER_PERIOD, "$<marker>) ")
        : rendered
    ).replace(MARKER_LINE_SPACES, "");
  },
});

export const NoteTaskItem = TaskItem.extend({
  renderMarkdown(node, helpers, context) {
    return withWrappedLines(
      (item) => TaskItem.config.renderMarkdown?.(item, helpers, context) ?? "",
      node,
      helpers,
      false
    );
  },
});

export const NoteBulletList = BulletList.extend({
  parseMarkdown(token, helpers) {
    if (token.type !== "list" || token.ordered === true) {
      return [];
    }

    return listsOf(token.items ?? [], helpers);
  },
});

/**
 * Upstream's tokenizer read letter markers as lists, "Mr. Smith" among them,
 * and saved that as "1. Smith". marked reads digits only, as GitHub does.
 */
export const NoteOrderedList = OrderedList.extend({
  // The element carries the delimiter so a pasted copy keeps it.
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: ".",
        parseHTML: (element: HTMLElement) => element.dataset.delimiter ?? ".",
        renderHTML: (attributes: Attrs) =>
          hasString(attributes, "delimiter") && attributes.delimiter === ")"
            ? { "data-delimiter": ")" }
            : {},
      },
    };
  },
  markdownTokenizer: NO_TOKENIZER,
  parseMarkdown(token, helpers) {
    if (token.type !== "list" || token.ordered !== true) {
      return [];
    }

    return helpers.createNode(
      "orderedList",
      {
        delimiter: LIST_DELIMITER.exec(token.raw ?? "")?.groups?.delimiter,
        start: hasNumber(token, "start") ? token.start : 1,
      },
      helpers.parseChildren(token.items ?? [])
    );
  },
});

/**
 * With no `taskList` parser registered, `@tiptap/markdown` hands a list that
 * mixes tasks and bullets to `NoteBulletList` whole, instead of re-reading
 * each task from its raw text.
 */
export const NoteTaskList = TaskList.extend({
  markdownTokenName: "list",
  markdownTokenizer: NO_TOKENIZER,
  parseMarkdown: () => [],
});
