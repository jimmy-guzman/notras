import { CheckIcon, UnlinkIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { isWikilinkTitle } from "@/core/notes";

import { clampToViewport } from "./clamp-to-viewport";

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
  const reasonId = useId();

  const refused =
    state.kind === "wikilink" &&
    text.trim() !== "" &&
    !isWikilinkTitle(text.trim());

  // The caller keys this on `state.id`, so a second invocation arrives as a
  // fresh mount and the draft starts empty without a reset pass.
  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  // Clamp once rendered, and again whenever the reason adds or drops its
  // line, so a popover flipped above the caret does not grow over the line
  // it edits.
  useEffect(() => {
    const element = containerRef.current;

    const observer = new ResizeObserver(() => {
      if (element !== null) {
        clampToViewport(element, state.left, state.top);
      }
    });

    if (element !== null) {
      clampToViewport(element, state.left, state.top);
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, [state.left, state.top]);

  const submit = () => {
    if (!refused) {
      onSubmit(url, text);
    }
  };

  return (
    // Keys are handled on the container so Escape works from the buttons too.
    // Enter submits from a field only, so on a button it presses that button.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- popover-level key handling; focus always sits on a real control inside
    <div
      className="link-editor"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
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
      <div className="link-editor-row">
        <input
          aria-describedby={refused ? reasonId : undefined}
          aria-invalid={refused}
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
      {refused ? (
        <p className="link-editor-reason" id={reasonId}>
          A link&apos;s title cannot hold [ or ]
        </p>
      ) : null}
    </div>
  );
}
