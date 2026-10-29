import { flip, shift, size } from "@floating-ui/dom";
import type {
  SuggestionFloatingUiOptions,
  SuggestionMount,
  SuggestionOptions,
} from "@tiptap/suggestion";

const MARGIN = 8;

const floatingUi: SuggestionFloatingUiOptions = {
  middleware: [
    flip({ padding: MARGIN }),
    shift({ padding: MARGIN }),
    size({
      apply: ({ availableHeight, elements }) => {
        elements.floating.style.setProperty(
          "--menu-room",
          `${availableHeight}px`
        );
      },
      padding: MARGIN,
    }),
  ],
  strategy: "fixed",
};

export interface SuggestionMenuItem {
  hint?: string;
  label: string;
  run: () => void;
}

class SuggestionMenu {
  private static instances = 0;

  private readonly element: HTMLDivElement;
  private readonly id: string;
  private items: SuggestionMenuItem[] = [];
  private selected = 0;
  private readonly unmount: () => void;

  constructor(mount: SuggestionMount) {
    this.element = document.createElement("div");
    this.element.className = "suggestion-menu";
    this.element.role = "listbox";
    SuggestionMenu.instances += 1;
    this.id = `suggestion-menu-${SuggestionMenu.instances}`;
    this.element.id = this.id;
    // autoUpdate cannot see the query span move when it wraps in a short note.
    this.unmount = mount(this.element, {
      autoUpdate: { animationFrame: true },
    });
  }

  destroy() {
    this.unmount();
  }

  handleKey(event: KeyboardEvent): boolean {
    if (this.items.length === 0) {
      return false;
    }

    switch (event.key) {
      case "ArrowDown": {
        this.selected = (this.selected + 1) % this.items.length;
        this.render();
        this.scrollSelectedIntoView();

        return true;
      }

      case "ArrowUp": {
        this.selected =
          (this.selected - 1 + this.items.length) % this.items.length;
        this.render();
        this.scrollSelectedIntoView();

        return true;
      }

      case "Enter": {
        this.items[this.selected]?.run();

        return true;
      }

      default: {
        return false;
      }
    }
  }

  update(items: SuggestionMenuItem[]) {
    this.items = items;
    this.selected = Math.min(this.selected, Math.max(0, items.length - 1));
    this.render();
  }

  private render() {
    this.element.replaceChildren();
    this.element.style.display = this.items.length === 0 ? "none" : "block";

    for (const [index, item] of this.items.entries()) {
      const button = document.createElement("button");

      button.type = "button";
      button.className =
        index === this.selected
          ? "suggestion-item suggestion-item-selected"
          : "suggestion-item";
      button.role = "option";
      button.id = `${this.id}-option-${index}`;
      button.ariaSelected = String(index === this.selected);
      button.textContent = item.label;

      if (item.hint !== undefined) {
        const hint = document.createElement("span");

        hint.className = "suggestion-hint";
        hint.textContent = item.hint;
        button.append(hint);
      }

      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        item.run();
      });
      this.element.append(button);
    }
  }

  private scrollSelectedIntoView() {
    this.element
      .querySelector(".suggestion-item-selected")
      ?.scrollIntoView({ block: "nearest" });
  }
}

export function suggestionMenuOptions<I>(
  toItems: (props: {
    command: (item: I) => void;
    items: I[];
  }) => SuggestionMenuItem[]
): Pick<SuggestionOptions<I, I>, "flip" | "floatingUi" | "render"> {
  return {
    flip: false,
    floatingUi,
    render: () => {
      let menu: null | SuggestionMenu = null;

      return {
        onExit: () => {
          menu?.destroy();
          menu = null;
        },
        onKeyDown: (props) => menu?.handleKey(props.event) ?? false,
        onStart: (props) => {
          menu = new SuggestionMenu(props.mount);
          menu.update(toItems(props));
        },
        onUpdate: (props) => {
          menu?.update(toItems(props));
        },
      };
    },
  };
}
