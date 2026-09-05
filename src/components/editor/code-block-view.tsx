import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

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
  const clearCopied = useDebouncedCallback(
    () => {
      setCopied(false);
    },
    { wait: 1500 }
  );

  // A fence can name a language lowlight does not know (```mermaid). Keep it
  // in the list, or the picker would silently rewrite it to "plain".
  const languages = useMemo(() => {
    const known = lowlight.listLanguages();

    return (
      language === "" || known.includes(language) ? known : [...known, language]
    ).toSorted();
  }, [language]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      clearCopied();
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not copy the code block",
        type: "error",
      });
    }
  }, [clearCopied, node.textContent]);

  const changeLanguage = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: event.target.value });
    },
    [updateAttributes]
  );

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
          onChange={changeLanguage}
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
