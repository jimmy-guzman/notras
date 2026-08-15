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

        return true;
      }
      case "ArrowUp": {
        this.selected =
          (this.selected - 1 + this.items.length) % this.items.length;
        this.render();

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
    if (rect) {
      this.element.style.left = `${rect.left}px`;
      this.element.style.top = `${rect.bottom + 4}px`;
    }

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
}
