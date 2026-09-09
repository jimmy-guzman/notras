import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { codeLanguages } from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

/**
 * Copy a block as markdown and edit its fence language from a hover toolbar.
 */
export function CodeBlockView({
  editor,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  const languageLabel = language === "" ? "plain" : language;
  const [copied, setCopied] = useState(false);
  const clearCopied = useDebouncedCallback(
    () => {
      setCopied(false);
    },
    { wait: 1500 }
  );

  // A fence can name a language the highlighter does not know. Keep it
  // in the list, or the picker would silently rewrite it to "plain".
  const languages = useMemo(() => {
    const known = codeLanguages;

    return (
      language === "" || known.includes(language) ? known : [...known, language]
    ).toSorted();
  }, [language]);

  const copy = useCallback(async () => {
    try {
      const manager = editor.markdown;

      if (manager === undefined) {
        throw new Error("the markdown serializer is unavailable");
      }

      await navigator.clipboard.writeText(manager.serialize(node.toJSON()));
      setCopied(true);
      clearCopied();
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not copy the code block",
        type: "error",
      });
    }
  }, [clearCopied, editor, node]);

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
        <span className="code-block-language-width">
          <span aria-hidden="true" className="code-block-language-label">
            {languageLabel}
          </span>
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
        </span>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
