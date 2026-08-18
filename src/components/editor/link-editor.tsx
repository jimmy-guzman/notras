import { CheckIcon, UnlinkIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface LinkEditorState {
  /** Caret rect for positioning the popover. */
  left: number;
  /** Empty when creating a link with no selection (text field shown). */
  needsText: boolean;
  top: number;
  url: string;
}

interface LinkEditorProps {
  onCancel: () => void;
  onRemove: () => void;
  onSubmit: (url: string, text?: string) => void;
  state: LinkEditorState;
}

/** Small caret-positioned popover to add/edit/remove a link (⌘⇧K). */
export function LinkEditor({
  onCancel,
  onRemove,
  onSubmit,
  state,
}: LinkEditorProps) {
  const [url, setUrl] = useState(state.url);
  const [text, setText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // The popover stays mounted between invocations, so a second ⌘⇧K on a
  // different link arrives as a new `state` rather than a remount. Reset the
  // draft during render (the pattern used in the notes route) and refocus
  // afterwards.
  const [syncedState, setSyncedState] = useState(state);

  if (syncedState !== state) {
    setSyncedState(state);
    setUrl(state.url);
    setText("");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is the only signal a second invocation arrived; dropping it stops the refocus
  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, [state]);

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

  const submit = useCallback(() => {
    onSubmit(url, state.needsText ? text : undefined);
  }, [onSubmit, state.needsText, text, url]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
    [onCancel, submit]
  );

  const changeText = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setText(event.target.value);
    },
    []
  );

  const changeUrl = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(event.target.value);
    },
    []
  );

  return (
    // Keys are handled on the container so Escape works from the buttons too.
    // biome-ignore lint/a11y/noStaticElementInteractions: popover-level key handling; focus always sits on a real control inside
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: popover-level key handling; focus always sits on a real control inside
    <div className="link-editor" onKeyDown={handleKeyDown} ref={containerRef}>
      {state.needsText ? (
        <input
          aria-label="link text"
          className="link-editor-input"
          onChange={changeText}
          placeholder="link text..."
          ref={firstFieldRef}
          value={text}
        />
      ) : null}
      <input
        aria-label="link url"
        className="link-editor-input"
        onChange={changeUrl}
        placeholder="enter url..."
        ref={state.needsText ? undefined : firstFieldRef}
        type="url"
        value={url}
      />
      <div className="link-editor-actions">
        <button
          aria-label="apply link"
          className="code-block-button"
          onClick={submit}
          type="button"
        >
          <CheckIcon size={14} />
        </button>
        {state.url === "" ? null : (
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
