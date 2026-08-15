import type { Editor, Range } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";

import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";

import type { SuggestionMenuItem } from "./suggestion-menu";

import { SuggestionMenu } from "./suggestion-menu";

interface SlashCommand {
  hint: string;
  label: string;
  run: (editor: Editor, range: Range) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    hint: "h1",
    label: "heading 1",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run();
    },
  },
  {
    hint: "h2",
    label: "heading 2",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run();
    },
  },
  {
    hint: "h3",
    label: "heading 3",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    hint: "-",
    label: "bullet list",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    hint: "1.",
    label: "numbered list",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    hint: "[ ]",
    label: "task list",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    hint: ">",
    label: "quote",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    hint: "```",
    label: "code block",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    hint: "",
    label: "table",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ cols: 2, rows: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    hint: "---",
    label: "divider",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    hint: "",
    label: "today's date",
    run: (editor, range) => {
      const today = new Date().toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        weekday: "long",
        year: "numeric",
      });

      editor.chain().focus().deleteRange(range).insertContent(today).run();
    },
  },
];

function toItems(props: {
  command: (item: SlashCommand) => void;
  items: SlashCommand[];
}): SuggestionMenuItem[] {
  return props.items.map((item) => {
    return {
      hint: item.hint,
      label: item.label,
      run: () => {
        props.command(item);
      },
    };
  });
}

/** `/` at the start of a line (or after a space) opens the insert menu. */
export const SlashMenu = Extension.create({
  addProseMirrorPlugins() {
    const { editor } = this;
    const suggestion: Omit<
      SuggestionOptions<SlashCommand, SlashCommand>,
      "editor"
    > = {
      char: "/",
      command: ({ editor: instance, props: item, range }) => {
        item.run(instance, range);
      },
      items: ({ query }) => {
        return SLASH_COMMANDS.filter((item) => {
          return item.label.includes(query.toLowerCase());
        });
      },
      pluginKey: new PluginKey("slashMenuSuggestion"),
      render: () => {
        let menu: null | SuggestionMenu = null;

        return {
          onExit: () => {
            menu?.destroy();
            menu = null;
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              menu?.destroy();
              menu = null;

              return true;
            }

            return menu?.handleKey(props.event) ?? false;
          },
          onStart: (props) => {
            menu = new SuggestionMenu();
            menu.update(toItems(props), props.clientRect?.());
          },
          onUpdate: (props) => {
            menu?.update(toItems(props), props.clientRect?.());
          },
        };
      },
      startOfLine: false,
    };

    return [Suggestion({ editor, ...suggestion })];
  },

  name: "slashMenu",
});
