import { CheckIcon, UnlinkIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
      Math.min(state.left, window.innerWidth - rect.width - margin),
    );
    const top =
      state.top + rect.height + margin > window.innerHeight
        ? Math.max(margin, state.top - rect.height - 28)
        : state.top;

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [state.left, state.top]);

  const submit = () => {
    onSubmit(url, state.needsText ? text : undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="link-editor" ref={containerRef}>
      {state.needsText ? (
        <input
          aria-label="link text"
          className="link-editor-input"
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="link text..."
          ref={firstFieldRef}
          value={text}
        />
      ) : null}
      <input
        aria-label="link url"
        className="link-editor-input"
        onChange={(event) => {
          setUrl(event.target.value);
        }}
        onKeyDown={handleKeyDown}
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
