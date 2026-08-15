import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { slashCommands, wikilinkCompletions } from "./completions";
import { frontmatterExtension } from "./frontmatter-extension";
import { livePreview } from "./live-preview";
import { markdownHighlight } from "./markdown-highlight";
import { focusMode, typewriterScrolling } from "./writing-modes";

export interface EditorHandle {
  focus(): void;
  getContent(): string;
  insertText(text: string): void;
}

interface EditorProps {
  focusModeEnabled?: boolean;
  focusOnMount?: boolean;
  /** Initial content -- the editor owns the buffer after mount. */
  initialContent: string;
  onBlur?: () => void;
  onChange: (content: string) => void;
  onReady?: (handle: EditorHandle) => void;
  placeholderText?: string;
  /** Stable getter for live note titles (wikilink completion). */
  titles?: () => string[];
  typewriterEnabled?: boolean;
}

/**
 * CodeMirror 6 markdown editor. All props except the writing-mode toggles
 * are frozen at mount: the editor owns the buffer, so remount (via `key`)
 * to load different content. Callbacks must therefore be safe to freeze --
 * read live values through refs, not closures.
 */
export function Editor({
  focusModeEnabled = false,
  typewriterEnabled = false,
  ...mountProps
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modesRef = useRef<Compartment | null>(null);
  const [config] = useState(() => {
    return mountProps;
  });

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return undefined;
    }

    const modes = new Compartment();
    const getTitles = () => {
      return config.titles?.() ?? [];
    };

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: config.initialContent,
        extensions: [
          history(),
          markdown({
            codeLanguages: languages,
            extensions: [frontmatterExtension],
          }),
          markdownHighlight,
          livePreview(),
          autocompletion({
            override: [wikilinkCompletions(getTitles), slashCommands],
          }),
          keymap.of([
            ...completionKeymap,
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          placeholder(config.placeholderText ?? "just write..."),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              config.onChange(update.state.doc.toString());
            }

            if (update.focusChanged && !update.view.hasFocus) {
              config.onBlur?.();
            }
          }),
          modes.of([]),
        ],
      }),
    });

    viewRef.current = view;
    modesRef.current = modes;

    config.onReady?.({
      focus: () => {
        view.focus();
      },
      getContent: () => {
        return view.state.doc.toString();
      },
      insertText: (text) => {
        const { from, to } = view.state.selection.main;

        view.dispatch({
          changes: { from, insert: text, to },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
    });

    if (config.focusOnMount === true) {
      view.focus();
      view.dispatch({
        selection: { anchor: view.state.doc.length },
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      modesRef.current = null;
    };
  }, [config]);

  useEffect(() => {
    const view = viewRef.current;
    const modes = modesRef.current;

    if (view === null || modes === null) {
      return;
    }

    view.dispatch({
      effects: modes.reconfigure([
        focusModeEnabled ? focusMode() : [],
        typewriterEnabled ? typewriterScrolling() : [],
      ]),
    });
  }, [focusModeEnabled, typewriterEnabled]);

  return <div className="allow-select min-h-0 flex-1" ref={containerRef} />;
}
