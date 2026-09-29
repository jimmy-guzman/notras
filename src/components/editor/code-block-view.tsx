import { useDebouncedCallback } from "@tanstack/react-pacer";
import { getHTMLFromFragment } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { cn } from "cn";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { hasString } from "@/components/editor/attrs";
import { MermaidDiagram } from "@/components/editor/mermaid-diagram";
import { codeLanguages } from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

/**
 * Copy a block's code and edit its fence language from a hover toolbar. A
 * `mermaid` fence draws above its code and folds the code while the caret is
 * elsewhere.
 */
export function CodeBlockView({
  editor,
  node,
  selectionInside,
  updateAttributes,
}: ReactNodeViewProps) {
  const language = hasString(node.attrs, "language") ? node.attrs.language : "";
  const languageLabel = language === "" ? "plain" : language;
  const [copied, setCopied] = useState(false);
  // Hundreds of blocks would carry hundreds of copies of the list, and every
  // element under a hidden tab is restyled when it shows again.
  const [listed, setListed] = useState(false);
  const list = () => {
    setListed(true);
  };
  const clearCopied = useDebouncedCallback(
    () => {
      setCopied(false);
    },
    { wait: 1500 }
  );

  // A fence can name a language the highlighter does not know. Keep it
  // in the list, or the picker would silently rewrite it to "plain".
  const languages = (
    language === "" || codeLanguages.includes(language)
      ? codeLanguages
      : [...codeLanguages, language]
  ).toSorted();

  const copy = async () => {
    try {
      // A terminal takes the plain code, and an app that pastes rich text
      // takes the HTML as a code block with its language. The code is a Blob
      // because happy-dom reads an empty string as a missing type.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": getHTMLFromFragment(Fragment.from(node), editor.schema),
          "text/plain": new Blob([node.textContent], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      clearCopied();
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not copy the code block",
        type: "error",
      });
    }
  };

  const changeLanguage = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateAttributes({ language: event.target.value });
  };

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "code-block-wrapper",
        selectionInside === true && "code-block-editing"
      )}
    >
      <div className="code-block-toolbar" contentEditable={false}>
        <button
          aria-label="copy code"
          className="code-block-button"
          onClick={() => {
            void copy();
          }}
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
            onFocus={list}
            onPointerEnter={list}
            value={language}
          >
            {listed ? (
              <>
                <option value="">plain</option>
                {languages.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </>
            ) : (
              <option value={language}>{languageLabel}</option>
            )}
          </select>
        </span>
      </div>
      {language === "mermaid" && <MermaidDiagram code={node.textContent} />}
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
