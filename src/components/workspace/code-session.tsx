import { useQuery } from "@tanstack/react-query";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import { FileError } from "@/core/errors";
import { codeQuery } from "@/data/queries";
import { styleNonce } from "@/lib/style-nonce";
import { activateTab, closeTab, registerTabRefresh } from "@/lib/tabs/store";
import { tabButtonId, tabPanelId } from "@/lib/tabs/tab";
import type { Tab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";

import { codeFileLanguage } from "./code-language";
import { UnreadableFile } from "./unreadable-file";

const READ_FAILED = "could not read this file";

interface CodeViewProps {
  language: string;
  text: string;
}

/**
 * The whole file as one read-only code block, highlighted the way a note's
 * fence is. Built for one text: the session keys it by the file's revision,
 * so a re-read mounts a fresh block instead of editing this one.
 */
function CodeView({ language, text }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const mount = (element: HTMLDivElement) => {
      const editor = new Editor({
        content: {
          content: [
            {
              attrs: { language },
              content: text === "" ? [] : [{ text, type: "text" }],
              type: "codeBlock",
            },
          ],
          type: "doc",
        },
        editable: false,
        element,
        extensions: [
          Document.extend({ content: "codeBlock" }),
          Text,
          CodeBlockShiki,
        ],
        injectNonce: styleNonce,
      });

      return () => {
        editor.destroy();
      };
    };

    return host.current === null ? undefined : mount(host.current);
  }, [language, text]);

  return <div className="typeset typeset-note p-6" ref={host} />;
}

interface CodeSessionProps {
  active: boolean;
  tab: Tab;
}

/**
 * One open code file, read-only: the file on disk drawn as one highlighted
 * block. It re-reads when the window regains focus or the watcher reports the
 * file, and never writes.
 */
export function CodeSession({ active, tab }: CodeSessionProps) {
  const { data: file, error, refetch } = useQuery(codeQuery(tab.id, tab.path));

  // Plain text for a file opened with notras, or a link whose target resolves
  // to a name shiki does not know.
  const language = codeFileLanguage(tab.path.split("/").at(-1) ?? "") ?? "text";

  // State rather than a ref: focus needs a render once the viewport exists.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  const attachScrollArea = (root: HTMLDivElement | null) => {
    setViewport(
      root?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null
    );
  };

  // Only a missing file is a deletion. A permission, size or encoding failure
  // leaves the tab open to say why and try again.
  const gone = error instanceof FileError && error.kind === "not-found";
  const reason = error === null || gone ? undefined : reasonOf(error);

  useEffect(() => {
    if (reason !== undefined) {
      toast.add({
        description: reason,
        title: READ_FAILED,
        type: "error",
      });
    }
  }, [reason]);

  useEffect(() => {
    if (gone) {
      closeTab(tab.id);
    }
  }, [gone, tab.id]);

  useEffect(
    () =>
      registerTabRefresh(tab.id, async () => {
        await refetch();
      }),
    [refetch, tab.id]
  );

  // The viewport takes focus whenever it is there to take it, which is what
  // lets the keyboard scroll the file, unless the user has put focus somewhere
  // since the tab became active. The body counts as nowhere.
  const focusAtActivation = useRef<Element | null>(null);

  useEffect(() => {
    if (active) {
      focusAtActivation.current = document.activeElement;
    }
  }, [active]);

  useEffect(() => {
    const untouched =
      document.activeElement === focusAtActivation.current ||
      document.activeElement === document.body;

    if (active && reason === undefined && untouched) {
      viewport?.focus();
    }
  }, [active, reason, viewport]);

  if (reason !== undefined) {
    return (
      <UnreadableFile
        active={active}
        id={tab.id}
        reason={reason}
        retry={() => {
          activateTab(tab.id);
          void refetch();
        }}
        title={READ_FAILED}
      />
    );
  }

  const body = (() => {
    if (file === undefined) {
      return (
        <div className="animate-in fade-in fill-mode-backwards flex flex-1 flex-col delay-300">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>reading this file</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    if (file.text === "") {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>this file is empty</EmptyTitle>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <ScrollArea
        className="min-h-0 flex-1 select-text"
        data-code-file
        data-wrap={language === "text"}
        ref={attachScrollArea}
      >
        <CodeView key={file.revision} language={language} text={file.text} />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  })();

  return (
    <div
      aria-labelledby={tabButtonId(tab.id)}
      className={cn("absolute inset-0 flex flex-col", !active && "opacity-0")}
      id={tabPanelId(tab.id)}
      inert={!active}
      role="tabpanel"
    >
      {body}
    </div>
  );
}
