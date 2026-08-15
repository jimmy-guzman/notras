/**
 * Minimal DOM dropdown shared by the slash menu and wikilink completion.
 * No positioning library: absolutely positioned off the suggestion's
 * client rect, styled with app tokens (see `.suggestion-menu` in
 * styles.css).
 */
export interface SuggestionMenuItem {
  hint?: string;
  label: string;
  run: () => void;
}

export class SuggestionMenu {
  private element: HTMLDivElement;
  private items: SuggestionMenuItem[] = [];
  private selected = 0;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "suggestion-menu";
    document.body.append(this.element);
  }

  destroy() {
    this.element.remove();
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

  update(items: SuggestionMenuItem[], rect: DOMRect | null | undefined) {
    this.items = items;
    this.selected = Math.min(this.selected, Math.max(0, items.length - 1));
    // Render first so the menu's size is measurable for positioning.
    this.render();
    if (rect) {
      this.position(rect);
    }
  }

  /** Place below the cursor; flip above when the viewport would clip it. */
  private position(rect: DOMRect) {
    const menu = this.element.getBoundingClientRect();
    const margin = 8;
    const fitsBelow =
      rect.bottom + 4 + menu.height + margin <= window.innerHeight;
    const fitsAbove = rect.top - 4 - menu.height >= margin;
    const top =
      fitsBelow || !fitsAbove ? rect.bottom + 4 : rect.top - 4 - menu.height;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - menu.width - margin),
    );

    this.element.style.left = `${left}px`;
    this.element.style.top = `${Math.max(margin, top)}px`;
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
