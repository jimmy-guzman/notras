import type { ReactNodeViewProps } from "@tiptap/react";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { lowlight } from "./extensions";

/**
 * Code block chrome (pattern from scratch): a hover toolbar with a copy
 * button and a language picker. View-only -- serialization still writes
 * the `language` attr as the fence info string.
 */
export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A fence can name a language lowlight does not know (```mermaid). Keep it
  // in the list, or the picker would silently rewrite it to "plain".
  const languages = useMemo(() => {
    const known = lowlight.listLanguages();

    return (
      language === "" || known.includes(language) ? known : [...known, language]
    ).toSorted();
  }, [language]);

  useEffect(
    () => () => {
      clearTimeout(resetRef.current);
    },
    []
  );

  const copy = () => {
    void navigator.clipboard
      .writeText(node.textContent)
      .then(() => {
        setCopied(true);
        clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => {
          setCopied(false);
        }, 1500);
      })
      .catch(() => {
        toast.error("could not copy the code block");
      });
  };

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      <div className="code-block-toolbar" contentEditable={false}>
        <button
          aria-label="copy code"
          className="code-block-button"
          onClick={copy}
          type="button"
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          {copied ? "copied" : "copy"}
        </button>
        <select
          aria-label="code language"
          className="code-block-language"
          onChange={(event) => {
            updateAttributes({ language: event.target.value });
          }}
          value={language}
        >
          <option value="">plain</option>
          {languages.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
