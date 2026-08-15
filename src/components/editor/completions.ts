import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";

import { snippetCompletion } from "@codemirror/autocomplete";

/** `[[` triggers note-title completion for wikilinks. */
export function wikilinkCompletions(getTitles: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[([^\]]*)$/);

    if (!match) {
      return null;
    }

    return {
      from: match.from + 2,
      options: getTitles().map((title): Completion => {
        return {
          apply: `${title}]]`,
          label: title,
          type: "text",
        };
      }),
      validFor: /^[^\]]*$/,
    };
  };
}

function insertDate() {
  return new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

const SLASH_COMMANDS: Completion[] = [
  snippetCompletion("# ${}", { detail: "heading 1", label: "/h1" }),
  snippetCompletion("## ${}", { detail: "heading 2", label: "/h2" }),
  snippetCompletion("### ${}", { detail: "heading 3", label: "/h3" }),
  snippetCompletion("- ${}", { detail: "bullet list", label: "/list" }),
  snippetCompletion("1. ${}", { detail: "numbered list", label: "/numbered" }),
  snippetCompletion("- [ ] ${}", { detail: "task list", label: "/task" }),
  snippetCompletion("> ${}", { detail: "quote", label: "/quote" }),
  snippetCompletion("```#{lang}\n#{}\n```", {
    detail: "code block",
    label: "/code",
  }),
  snippetCompletion("| #{a} | b |\n| - | - |\n|  |  |", {
    detail: "table",
    label: "/table",
  }),
  snippetCompletion("---\n${}", { detail: "divider", label: "/divider" }),
  snippetCompletion("[[${}]]", { detail: "wikilink", label: "/link" }),
  {
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, insert: insertDate(), to },
      });
    },
    detail: "today's date",
    label: "/date",
    type: "text",
  },
];

/** `/` at the start of a line opens the quick-insert menu. */
export function slashCommands(
  context: CompletionContext,
): CompletionResult | null {
  const match = context.matchBefore(/\/[\w-]*$/);

  if (!match) {
    return null;
  }

  const line = context.state.doc.lineAt(match.from);

  if (line.from !== match.from) {
    return null;
  }

  return {
    filter: true,
    from: match.from,
    options: SLASH_COMMANDS,
    validFor: /^\/[\w-]*$/,
  };
}
