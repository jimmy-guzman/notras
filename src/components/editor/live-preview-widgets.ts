import type { EditorView } from "@codemirror/view";

import { WidgetType } from "@codemirror/view";

export class BulletWidget extends WidgetType {
  private readonly glyph: string = "•";

  eq(other: BulletWidget) {
    return other.glyph === this.glyph;
  }

  toDOM() {
    const span = document.createElement("span");

    span.className = "cm-live-bullet";
    span.textContent = this.glyph;

    return span;
  }
}

export class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    /** Range of the `[ ]`/`[x]` marker text to rewrite on toggle. */
    private readonly markerFrom: number,
    private readonly markerTo: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return (
      other.checked === this.checked &&
      other.markerFrom === this.markerFrom &&
      other.markerTo === this.markerTo
    );
  }

  toDOM(view: EditorView) {
    const label = document.createElement("span");

    label.className = "cm-live-checkbox";

    const input = document.createElement("input");

    input.type = "checkbox";
    input.checked = this.checked;
    input.addEventListener("change", () => {
      view.dispatch({
        changes: {
          from: this.markerFrom,
          insert: this.checked ? "[ ]" : "[x]",
          to: this.markerTo,
        },
      });
    });

    label.append(input);

    return label;
  }
}

export class HrWidget extends WidgetType {
  private readonly className: string = "cm-live-hr";

  eq(other: HrWidget) {
    return other.className === this.className;
  }

  toDOM() {
    const rule = document.createElement("span");

    rule.className = this.className;
    rule.setAttribute("role", "presentation");

    return rule;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM() {
    const container = document.createElement("span");

    container.className = "cm-live-image";

    const image = document.createElement("img");

    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("error", () => {
      const fallback = document.createElement("span");

      fallback.className = "cm-live-image-fallback";
      fallback.textContent = this.alt === "" ? "image not found" : this.alt;
      image.replaceWith(fallback);
    });

    container.append(image);

    return container;
  }
}

export class TableWidget extends WidgetType {
  constructor(
    private readonly header: string[],
    private readonly rows: string[][],
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      JSON.stringify(other.header) === JSON.stringify(this.header) &&
      JSON.stringify(other.rows) === JSON.stringify(this.rows)
    );
  }

  toDOM() {
    const table = document.createElement("table");

    table.className = "cm-live-table";

    const head = table.createTHead().insertRow();

    for (const cell of this.header) {
      const th = document.createElement("th");

      th.textContent = cell;
      head.append(th);
    }

    const body = table.createTBody();

    for (const row of this.rows) {
      const tr = body.insertRow();

      for (const cell of row) {
        tr.insertCell().textContent = cell;
      }
    }

    return table;
  }
}
