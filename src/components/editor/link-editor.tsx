import { CheckIcon, UnlinkIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface LinkEditorState {
  /** Distinguishes one invocation from the next, so the popover remounts. */
  id: number;
  /** A wikilink is a title and nothing else: no url, and nothing to unlink. */
  kind: "link" | "wikilink";
  /** Caret rect for positioning the popover. */
  left: number;
  /** The link's current words, empty when there is nothing selected yet. */
  text: string;
  top: number;
  url: string;
}

interface LinkEditorProps {
  onCancel: () => void;
  onRemove: () => void;
  onSubmit: (url: string, text?: string) => void;
  state: LinkEditorState;
}

/** Small popover to add, edit or remove a link: both its words and its url. */
export function LinkEditor({
  onCancel,
  onRemove,
  onSubmit,
  state,
}: LinkEditorProps) {
  const [url, setUrl] = useState(state.url);
  const [text, setText] = useState(state.text);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // The caller keys this on `state.id`, so a second invocation arrives as a
  // fresh mount and the draft starts empty without a reset pass.
  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  // Clamp inside the viewport once rendered (same policy as the
  // suggestion menu).
  useEffect(() => {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(state.left, window.innerWidth - rect.width - margin)
    );
    const top =
      state.top + rect.height + margin > window.innerHeight
        ? Math.max(margin, state.top - rect.height - 28)
        : state.top;

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [state.left, state.top]);

  const submit = () => {
    onSubmit(url, text);
  };

  return (
    // Keys are handled on the container so Escape works from the buttons too.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- popover-level key handling; focus always sits on a real control inside
    <div
      className="link-editor"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      ref={containerRef}
    >
      <input
        aria-label={state.kind === "wikilink" ? "note title" : "link text"}
        className="link-editor-input"
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder={
          state.kind === "wikilink" ? "note title..." : "link text..."
        }
        ref={firstFieldRef}
        value={text}
      />
      {state.kind === "wikilink" ? null : (
        <input
          aria-label="link url"
          className="link-editor-input"
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          placeholder="enter url..."
          type="url"
          value={url}
        />
      )}
      <div className="link-editor-actions">
        <button
          aria-label="apply link"
          className="code-block-button"
          onClick={submit}
          type="button"
        >
          <CheckIcon size={14} />
        </button>
        {state.url === "" || state.kind === "wikilink" ? null : (
          <button
            aria-label="remove link"
            className="code-block-button"
            onClick={onRemove}
            type="button"
          >
            <UnlinkIcon size={14} />
          </button>
        )}
        <button
          aria-label="cancel"
          className="code-block-button"
          onClick={onCancel}
          type="button"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
