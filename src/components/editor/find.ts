import { Extension, findChildren } from "@tiptap/core";
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, SelectionBookmark } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { hasString } from "./attrs";
import { calloutOf } from "./callout";
import { measureViewport } from "./code-block-shiki";

interface Match {
  /** The callout whose drawn label holds the match; the match itself is the caret at its body's start. */
  callout?: { from: number; to: number };
  from: number;
  to: number;
}

interface FindState {
  active: number;
  /** The floating find bar covers the top of the editor. */
  clearance: boolean;
  matches: Match[];
  prior: SelectionBookmark;
  query: string | null;
  /** The positions on screen, or nothing while the editor cannot be measured. */
  screen: Match | undefined;
}

export interface FindSnapshot {
  current: number;
  total: number;
}

export interface FindHandle {
  alive: () => boolean;
  /** Focuses the editor with a collapsed caret at the active match's start. */
  caretToMatch: () => void;
  navigate: (direction: -1 | 1) => void;
  restoreFocus: () => void;
  selectionText: () => string;
  /** Makes room above the first line while the find bar shows over it. */
  setClearance: (on: boolean) => void;
  setQuery: (query: string | null) => void;
  snapshot: () => FindSnapshot;
  /**
   * `moved` is true when the user changed the text or the caret. A reload
   * from disk, marked with `FROM_DISK`, is not theirs.
   */
  subscribe: (listener: (moved: boolean) => void) => () => void;
}

/** Transaction meta for a replacement that applies the file as read from disk. */
export const FROM_DISK = "fromDisk";

const findKey = new PluginKey<FindState>("noteFind");

function isFindState(value: unknown): value is FindState {
  return (
    typeof value === "object" &&
    value !== null &&
    "matches" in value &&
    "query" in value
  );
}

// Not `RegExp.escape`: WebKit escapes an astral character by its low 16 bits,
// so U+2002A gains a backslash and stops matching under the `u` flag.
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
const FIND_CLEARANCE = 52;

// The screen is sampled at mid-width, so its first and last lines reach past
// the sample by up to half a line. A line holds far fewer characters than this.
const SCREEN_MARGIN = 500;

function isFindOpen(state: EditorState) {
  const query = findKey.getState(state)?.query;

  return query !== undefined && query !== null;
}

function hasClearance(state: EditorState) {
  return findKey.getState(state)?.clearance === true;
}

function textOf(node: Node) {
  return (node.type.name === "wikilink" || node.type.name === "embed") &&
    hasString(node.attrs, "title")
    ? node.attrs.title
    : node.textContent;
}

function blockMatches(block: Node, position: number, pattern: RegExp) {
  const units: { from: number; text: string; to: number }[] = [];
  block.descendants((node, offset) => {
    if (node.isText) {
      const text = node.textContent;

      for (let i = 0; i < text.length; i += 1) {
        units.push({
          from: position + 1 + offset + i,
          text: text[i] ?? "",
          to: position + 2 + offset + i,
        });
      }
    } else if (node.isLeaf) {
      const text =
        node.type.name === "wikilink" || node.type.name === "embed"
          ? textOf(node)
          : "\n";

      // Code units, not code points: `match.index` counts the former.
      for (let i = 0; i < text.length; i += 1) {
        units.push({
          from: position + 1 + offset,
          text: text.charAt(i),
          to: position + 1 + offset + node.nodeSize,
        });
      }
    }

    return !node.isLeaf;
  });
  const text = units.map((unit) => unit.text).join("");

  return [...text.matchAll(pattern)].flatMap((match) => {
    const first = units[match.index];
    const last = units[match.index + match[0].length - 1];

    return first === undefined || last === undefined
      ? []
      : [{ from: first.from, to: last.to }];
  });
}

/**
 * A callout's label is drawn, not text, so a hit on it puts the caret where
 * the body starts. A callout with no text block in it has nowhere to put one.
 */
function labelMatches(quote: Node, position: number, pattern: RegExp) {
  const label = calloutOf(quote.attrs);

  if (label === null) {
    return [];
  }

  const [body] = findChildren(quote, (node) => node.isTextblock);

  if (body === undefined) {
    return [];
  }

  const start = position + 1 + body.pos + 1;

  return [...label.matchAll(pattern)].map(() => ({
    callout: { from: position, to: position + quote.nodeSize },
    from: start,
    to: start,
  }));
}

function matchesIn(doc: Node, query: string | null) {
  if (query === null || query === "") {
    return [];
  }

  const pattern = new RegExp(query.replaceAll(REGEXP_SPECIAL, "\\$&"), "giu");
  const matches: Match[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) {
      matches.push(...labelMatches(node, position, pattern));

      return true;
    }

    matches.push(...blockMatches(node, position, pattern));

    return false;
  });

  return matches;
}

// A short query matches tens of thousands of times in a long note, and drawing
// every one stalls each keystroke. The count and stepping use the whole list.
function decorations(doc: Node, { active, matches, screen }: FindState) {
  return DecorationSet.create(
    doc,
    matches.flatMap((match, index) => {
      if (
        index !== active &&
        screen !== undefined &&
        (match.to < screen.from || match.from > screen.to)
      ) {
        return [];
      }

      if (match.callout !== undefined) {
        return [
          Decoration.node(match.callout.from, match.callout.to, {
            class:
              index === active
                ? "note-find-label note-find-label-active"
                : "note-find-label",
          }),
        ];
      }

      const attributes = {
        class:
          index === active
            ? "note-find-match note-find-active"
            : "note-find-match",
      };

      const found = [Decoration.inline(match.from, match.to, attributes)];
      doc.nodesBetween(match.from, match.to, (node, position) => {
        if (node.isAtom && node.isInline) {
          found.push(
            Decoration.node(position, position + node.nodeSize, attributes)
          );
        }
      });

      return found;
    })
  );
}

function screenOf(view: EditorView) {
  const seen = measureViewport(view);

  return (
    seen && { from: seen.from - SCREEN_MARGIN, to: seen.to + SCREEN_MARGIN }
  );
}

/** Highlights the matches now on screen, after a scroll, a resize or an edit moved it. */
function highlightScreen(view: EditorView) {
  const state = findKey.getState(view.state);

  if (state === undefined || state.query === null) {
    return;
  }

  const screen = screenOf(view);

  if (screen?.from !== state.screen?.from || screen?.to !== state.screen?.to) {
    view.dispatch(
      view.state.tr
        .setMeta(findKey, { ...state, screen } satisfies FindState)
        .setMeta("addToHistory", false)
    );
  }
}

/** Where a match shows: its text, or the label it was found in. */
function matchRect(view: EditorView, match: Match) {
  const quote =
    match.callout === undefined ? null : view.nodeDOM(match.callout.from);

  const label =
    quote instanceof HTMLElement
      ? quote.querySelector("[data-callout-title]")
      : null;

  return label?.getBoundingClientRect() ?? view.coordsAtPos(match.from);
}

function revealMatch(editor: Editor) {
  if (editor.isDestroyed) {
    return;
  }

  const state = findKey.getState(editor.state);
  const match = state?.matches[state.active];

  const viewport = editor.view.dom.closest(
    '[data-slot="scroll-area-viewport"]'
  );

  if (
    state === undefined ||
    match === undefined ||
    !(viewport instanceof HTMLElement)
  ) {
    return;
  }

  const rect = matchRect(editor.view, match);
  const bounds = viewport.getBoundingClientRect();
  const top = bounds.top + (state.clearance ? FIND_CLEARANCE : 0);
  const bottom = bounds.bottom - 16;

  if (rect.top < top || rect.bottom > bottom) {
    viewport.scrollTop += (rect.top + rect.bottom - top - bottom) / 2;
  }
}

export function createFindHandle(editor: Editor): FindHandle {
  const { view } = editor;
  let destroyed = view.isDestroyed;

  return {
    alive: () => !(destroyed || view.isDestroyed),
    caretToMatch: () => {
      if (view.isDestroyed) {
        return;
      }

      const state = findKey.getState(editor.state);
      const match = state?.matches[state.active];

      if (match !== undefined) {
        editor.view.dispatch(
          editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, match.from))
            .setMeta("addToHistory", false)
        );
      }

      editor.view.focus();
    },
    navigate: (direction) => {
      if (view.isDestroyed) {
        return;
      }

      const state = findKey.getState(editor.state);

      if (
        state === undefined ||
        state.query === null ||
        state.matches.length === 0
      ) {
        return;
      }

      const active =
        (state.active + direction + state.matches.length) %
        state.matches.length;

      editor.view.dispatch(
        editor.state.tr
          .setMeta(findKey, { ...state, active })
          .setMeta("addToHistory", false)
      );
      revealMatch(editor);
    },
    restoreFocus: () => {
      if (view.isDestroyed) {
        return;
      }

      const state = findKey.getState(editor.state);

      if (state === undefined) {
        return;
      }

      const match = state.matches[state.active];

      const selection =
        match === undefined
          ? state.prior.resolve(editor.state.doc)
          : TextSelection.create(editor.state.doc, match.from, match.to);

      editor.view.dispatch(
        editor.state.tr.setSelection(selection).setMeta("addToHistory", false)
      );
      editor.view.focus();
      revealMatch(editor);
    },
    selectionText: () => {
      if (view.isDestroyed) {
        return "";
      }

      const { from, to } = editor.state.selection;

      return editor.state.doc.textBetween(from, to, "\n", textOf);
    },
    setClearance: (on) => {
      if (view.isDestroyed) {
        return;
      }

      const state = findKey.getState(editor.state);

      if (state === undefined || state.clearance === on) {
        return;
      }

      editor.view.dispatch(
        editor.state.tr
          .setMeta(findKey, { ...state, clearance: on } satisfies FindState)
          .setMeta("addToHistory", false)
      );

      if (on) {
        revealMatch(editor);
      }
    },
    setQuery: (query) => {
      if (view.isDestroyed) {
        return;
      }

      const state = findKey.getState(editor.state);

      if (state === undefined || state.query === query) {
        return;
      }

      const matches = matchesIn(editor.state.doc, query);

      const next = matches.findIndex(
        ({ from }) => from >= editor.state.selection.from
      );

      editor.view.dispatch(
        editor.state.tr
          .setMeta(findKey, {
            active: Math.max(0, next),
            clearance: state.clearance,
            matches,
            prior:
              state.query === null
                ? editor.state.selection.getBookmark()
                : state.prior,
            query,
            screen: screenOf(view),
          } satisfies FindState)
          .setMeta("addToHistory", false)
      );
      revealMatch(editor);
    },
    snapshot: () => {
      const state = view.isDestroyed
        ? undefined
        : findKey.getState(editor.state);

      return {
        current:
          state === undefined || state.matches.length === 0
            ? 0
            : state.active + 1,
        total: state?.matches.length ?? 0,
      };
    },
    subscribe: (listener) => {
      const onTransaction = ({ transaction }: EditorEvents["transaction"]) => {
        listener(
          (transaction.docChanged || transaction.selectionSet) &&
            transaction.getMeta(FROM_DISK) !== true
        );
      };

      editor.on("transaction", onTransaction);

      const onDestroy = () => {
        // Tiptap emits destroy before it destroys the view.
        destroyed = true;
        listener(false);
      };

      editor.on("destroy", onDestroy);
      editor.on("unmount", onDestroy);

      return () => {
        editor.off("transaction", onTransaction);
        editor.off("destroy", onDestroy);
        editor.off("unmount", onDestroy);
      };
    },
  };
}

export const Find = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        props: {
          attributes: (state) => ({
            class: hasClearance(state) ? "note-find-open" : "",
          }),
          decorations: (state) => {
            const find = findKey.getState(state);

            return find === undefined
              ? DecorationSet.empty
              : decorations(state.doc, find);
          },
        },
        state: {
          apply: (transaction, previous) => {
            const meta: unknown = transaction.getMeta(findKey);

            if (isFindState(meta)) {
              return meta;
            }

            if (!transaction.docChanged) {
              return previous;
            }

            const matches = matchesIn(transaction.doc, previous.query);
            const old = previous.matches[previous.active];

            const position =
              old === undefined
                ? transaction.selection.from
                : transaction.mapping.map(old.from);

            const active = matches.findIndex(({ from }) => from >= position);

            return {
              active: Math.max(0, active),
              clearance: previous.clearance,
              matches,
              prior: previous.prior.map(transaction.mapping),
              query: previous.query,
              screen: previous.screen && {
                from: transaction.mapping.map(previous.screen.from),
                to: transaction.mapping.map(previous.screen.to),
              },
            };
          },
          init: (_, state) => ({
            active: 0,
            clearance: false,
            matches: [],
            prior: state.selection.getBookmark(),
            query: null,
            screen: undefined,
          }),
        },
        view: (mounted) => {
          let frame = 0;

          const schedule = () => {
            if (frame === 0) {
              frame = requestAnimationFrame(() => {
                frame = 0;
                highlightScreen(mounted);
              });
            }
          };

          const follow = ({ target }: Event) => {
            if (
              target === window ||
              (target instanceof globalThis.Node &&
                target.contains(mounted.dom))
            ) {
              schedule();
            }
          };

          document.addEventListener("scroll", follow, {
            capture: true,
            passive: true,
          });
          window.addEventListener("resize", follow);

          return {
            destroy: () => {
              cancelAnimationFrame(frame);
              document.removeEventListener("scroll", follow, { capture: true });
              window.removeEventListener("resize", follow);
            },
            update: (view, previous) => {
              const open = isFindOpen(view.state);

              const hadClearance = hasClearance(previous);
              const clearance = hasClearance(view.state);

              const viewport = view.dom.closest(
                '[data-slot="scroll-area-viewport"]'
              );

              if (
                hadClearance !== clearance &&
                viewport instanceof HTMLElement
              ) {
                // The extra scroll space lets the first line clear the floating bar.
                // Compensating here keeps showing the bar from shifting the document.
                viewport.scrollTop += clearance
                  ? FIND_CLEARANCE
                  : -FIND_CLEARANCE;
              }

              // An edit can pull text on screen without a scroll.
              if (open && previous.doc !== view.state.doc) {
                schedule();
              }
            },
          };
        },
      }),
    ];
  },
  name: "noteFind",
});
