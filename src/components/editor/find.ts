import { type Editor, Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  type SelectionBookmark,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface Match {
  from: number;
  to: number;
}
interface FindState {
  active: number;
  matches: Match[];
  prior: SelectionBookmark;
  query: string | null;
}
export interface FindSnapshot {
  current: number;
  total: number;
}
export interface FindHandle {
  alive: () => boolean;
  navigate: (direction: -1 | 1) => void;
  restoreFocus: () => void;
  selectionText: () => string;
  setQuery: (query: string | null) => void;
  snapshot: () => FindSnapshot;
  subscribe: (listener: () => void) => () => void;
}

const findKey = new PluginKey<FindState>("noteFind");
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const FIND_CLEARANCE = 52;

function isFindOpen(state: EditorState) {
  return typeof findKey.getState(state)?.query === "string";
}

function textOf(node: Node) {
  return node.type.name === "wikilink" && typeof node.attrs.title === "string"
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
      const text = node.type.name === "wikilink" ? textOf(node) : "\n";
      for (const character of text.split("")) {
        units.push({
          from: position + 1 + offset,
          text: character,
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

function matchesIn(doc: Node, query: string | null) {
  if (query === null || query === "") {
    return [];
  }
  const pattern = new RegExp(query.replace(REGEXP_SPECIAL, "\\$&"), "giu");
  const matches: Match[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }
    matches.push(...blockMatches(node, position, pattern));
    return false;
  });
  return matches;
}

function decorations(doc: Node, state: FindState) {
  return DecorationSet.create(
    doc,
    state.matches.flatMap((match, index) => {
      const attributes = {
        class:
          index === state.active
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

function revealMatch(editor: Editor) {
  if (editor.isDestroyed) {
    return;
  }
  const state = findKey.getState(editor.state);
  const match = state?.matches[state.active];
  const viewport = editor.view.dom.closest(
    '[data-slot="scroll-area-viewport"]'
  );
  if (match === undefined || !(viewport instanceof HTMLElement)) {
    return;
  }
  const rect = editor.view.coordsAtPos(match.from);
  const bounds = viewport.getBoundingClientRect();
  const top = bounds.top + FIND_CLEARANCE;
  const bottom = bounds.bottom - 16;
  if (rect.top < top) {
    viewport.scrollTop += rect.top - top;
  } else if (rect.bottom > bottom) {
    viewport.scrollTop += rect.bottom - bottom;
  }
}

export function createFindHandle(editor: Editor): FindHandle {
  let destroyed = editor.isDestroyed;
  return {
    alive: () => !(destroyed || editor.isDestroyed),
    navigate: (direction) => {
      if (editor.isDestroyed) {
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
      if (editor.isDestroyed) {
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
      if (editor.isDestroyed) {
        return "";
      }
      const { from, to } = editor.state.selection;
      return editor.state.doc.textBetween(from, to, "\n", textOf);
    },
    setQuery: (query) => {
      if (editor.isDestroyed) {
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
            matches,
            prior:
              state.query === null
                ? editor.state.selection.getBookmark()
                : state.prior,
            query,
          } satisfies FindState)
          .setMeta("addToHistory", false)
      );
      revealMatch(editor);
    },
    snapshot: () => {
      const state = editor.isDestroyed
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
      editor.on("transaction", listener);
      const onDestroy = () => {
        // Tiptap emits destroy before it destroys the view.
        destroyed = true;
        listener();
      };
      editor.on("destroy", onDestroy);
      return () => {
        editor.off("transaction", listener);
        editor.off("destroy", onDestroy);
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
            class: isFindOpen(state) ? "note-find-open" : "",
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
            const meta: FindState | undefined = transaction.getMeta(findKey);
            if (meta !== undefined) {
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
              matches,
              prior: previous.prior.map(transaction.mapping),
              query: previous.query,
            };
          },
          init: (_, state) => ({
            active: 0,
            matches: [],
            prior: state.selection.getBookmark(),
            query: null,
          }),
        },
        view: () => ({
          update: (view, previous) => {
            const wasOpen = isFindOpen(previous);
            const open = isFindOpen(view.state);
            const viewport = view.dom.closest(
              '[data-slot="scroll-area-viewport"]'
            );
            if (wasOpen !== open && viewport instanceof HTMLElement) {
              // The extra scroll space lets the first line clear the floating bar.
              // Compensating here keeps opening find from shifting the document.
              viewport.scrollTop += open ? FIND_CLEARANCE : -FIND_CLEARANCE;
            }
          },
        }),
      }),
    ];
  },
  name: "noteFind",
});
