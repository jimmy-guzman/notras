import type {
  SuggestionFloatingUiOptions,
  SuggestionMount,
  SuggestionOptions,
} from "@tiptap/suggestion";

const GAP = 4;
const MARGIN = 8;

/**
 * The plugin's `flip` keeps no margin, so this keeps 8px on every side and
 * shortens the menu to the roomier side of the query.
 */
const floatingUi: SuggestionFloatingUiOptions = {
  middleware: [
    {
      fn: ({ elements, rects, x, y }) => {
        const room = `${Math.max(
          rects.reference.y - GAP - MARGIN,
          window.innerHeight -
            rects.reference.y -
            rects.reference.height -
            GAP -
            MARGIN
        )}px`;

        if (elements.floating.style.getPropertyValue("--menu-room") !== room) {
          elements.floating.style.setProperty("--menu-room", room);

          return { reset: { rects: true } };
        }

        const above = rects.reference.y - GAP - rects.floating.height;

        const crowdsBottom =
          y + rects.floating.height > window.innerHeight - MARGIN;

        return {
          x: Math.max(
            MARGIN,
            Math.min(x, window.innerWidth - rects.floating.width - MARGIN)
          ),
          y: Math.max(MARGIN, crowdsBottom ? above : y),
        };
      },
      name: "clampToViewport",
    },
  ],
  strategy: "fixed",
};

export interface SuggestionMenuItem {
  hint?: string;
  label: string;
  run: () => void;
}

/** The dropdown both menus share, styled by `.suggestion-menu` in styles.css. */
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
): Pick<SuggestionOptions<I, I>, "floatingUi" | "offset" | "render"> {
  return {
    floatingUi,
    offset: { mainAxis: GAP },
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
