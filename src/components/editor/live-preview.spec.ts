import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

import type { LivePreviewOp } from "./live-preview";

import { buildLivePreviewOps } from "./live-preview";

function build(doc: string, cursor = doc.length, head?: number) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
    selection:
      head === undefined ? { anchor: cursor } : { anchor: cursor, head },
  });

  ensureSyntaxTree(state, doc.length, 5000);

  return buildLivePreviewOps(state);
}

function ofKind<K extends LivePreviewOp["kind"]>(
  ops: LivePreviewOp[],
  kind: K,
) {
  return ops.filter((op): op is Extract<LivePreviewOp, { kind: K }> => {
    return op.kind === kind;
  });
}

function hiddenTexts(doc: string, ops: LivePreviewOp[]) {
  return ofKind(ops, "hide").map((op) => {
    return doc.slice(op.from, op.to);
  });
}

describe("buildLivePreviewOps", () => {
  describe("inline marks", () => {
    it("should hide marks on elements the cursor is not touching", () => {
      const doc = "## heading\n\n**bold** and `code`\n\nend\n";

      expect(hiddenTexts(doc, build(doc))).toStrictEqual([
        "## ",
        "**",
        "**",
        "`",
        "`",
      ]);
    });

    it("should reveal marks when the cursor enters the element", () => {
      const doc = "## heading\n\n**bold**\n";
      const insideBold = doc.indexOf("bold") + 1;

      expect(hiddenTexts(doc, build(doc, insideBold))).toStrictEqual(["## "]);
    });

    it("should reveal on inclusive element boundaries", () => {
      const doc = "**bold** x\n";

      expect(hiddenTexts(doc, build(doc, 0))).toStrictEqual([]);
    });

    it("should hide link brackets and url, leaving the text", () => {
      const doc = "see [notes](https://example.com) ok\n";

      expect(hiddenTexts(doc, build(doc))).toStrictEqual([
        "[",
        "]",
        "(",
        "https://example.com",
        ")",
      ]);
    });

    it("should never hide autolink urls", () => {
      const doc = "<https://example.com>\n\nend\n";

      expect(build(doc)).toStrictEqual([]);
    });

    it("should reveal every element a selection spans", () => {
      const doc = "## a\n\n**b** and `c`\n";

      expect(hiddenTexts(doc, build(doc, 0, doc.length))).toStrictEqual([]);
    });

    it("should leave setext heading underlines alone", () => {
      const doc = "title\n-----\n\nend\n";

      expect(ofKind(build(doc), "hide")).toStrictEqual([]);
    });
  });

  describe("quotes", () => {
    it("should hide quote marks and tag quote lines", () => {
      const doc = "> quoted\n\nend\n";
      const ops = build(doc);

      expect(hiddenTexts(doc, ops)).toStrictEqual(["> "]);
      expect(ofKind(ops, "quoteLine")).toStrictEqual([
        { from: 0, kind: "quoteLine" },
      ]);
    });

    it("should keep quote lines tagged while the cursor is on them", () => {
      const ops = build("> quoted\n", 3);

      expect(ofKind(ops, "hide")).toStrictEqual([]);
      expect(ofKind(ops, "quoteLine")).toHaveLength(1);
    });
  });

  describe("lists", () => {
    it("should turn bullet marks into bullets, but not ordered lists", () => {
      const doc = "- one\n- two\n\n1. first\n\nend\n";
      const ops = build(doc);

      expect(ofKind(ops, "bullet")).toStrictEqual([
        { from: 0, kind: "bullet", to: 1 },
        { from: 6, kind: "bullet", to: 7 },
      ]);
    });

    it("should reveal the bullet on its own line only", () => {
      const doc = "- one\n- two\n";
      const ops = build(doc, 2);

      expect(ofKind(ops, "bullet")).toStrictEqual([
        { from: 6, kind: "bullet", to: 7 },
      ]);
    });
  });

  describe("tasks", () => {
    it("should produce checkbox ops with checked state", () => {
      const doc = "- [ ] todo\n- [x] done\n\nend\n";
      const checkboxes = ofKind(build(doc), "checkbox");

      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0]?.checked).toBe(false);
      expect(checkboxes[1]?.checked).toBe(true);
      expect(
        doc.slice(checkboxes[1]?.markerFrom, checkboxes[1]?.markerTo),
      ).toBe("[x]");
    });

    it("should dim the text of checked tasks", () => {
      const doc = "- [x] done\n\nend\n";
      const done = ofKind(build(doc), "taskDone");

      expect(done).toHaveLength(1);
      expect(doc.slice(done[0]?.from, done[0]?.to)).toBe("done");
    });

    it("should reveal the raw marker on the cursor line but keep the dim", () => {
      const doc = "- [x] done\n";
      const ops = build(doc, 8);

      expect(ofKind(ops, "checkbox")).toStrictEqual([]);
      expect(ofKind(ops, "taskDone")).toHaveLength(1);
    });
  });

  describe("fenced code", () => {
    it("should hide fence lines and tag every block line", () => {
      const doc = "```ts\nconst a = 1\n```\n\nend\n";
      const ops = build(doc);

      expect(ofKind(ops, "fenceLine")).toStrictEqual([
        { from: 0, kind: "fenceLine", to: 5 },
        { from: 18, kind: "fenceLine", to: 21 },
      ]);
      expect(ofKind(ops, "codeLine")).toHaveLength(3);
      expect(ofKind(ops, "hide")).toStrictEqual([]);
    });

    it("should reveal fences when the cursor is inside the block", () => {
      const doc = "```ts\nconst a = 1\n```\n\nend\n";
      const ops = build(doc, doc.indexOf("const") + 2);

      expect(ofKind(ops, "fenceLine")).toStrictEqual([]);
      expect(ofKind(ops, "codeLine")).toHaveLength(3);
    });
  });

  describe("horizontal rules", () => {
    it("should render a rule when the cursor is elsewhere", () => {
      const doc = "a\n\n---\n\nb\n";
      const ops = build(doc);

      expect(ofKind(ops, "hr")).toStrictEqual([{ from: 3, kind: "hr", to: 6 }]);
    });

    it("should show the source on the cursor line", () => {
      const doc = "a\n\n---\n\nb\n";

      expect(ofKind(build(doc, 4), "hr")).toStrictEqual([]);
    });
  });

  describe("images", () => {
    it("should replace the whole image node, hiding nothing separately", () => {
      const doc = "![shot](attachments/x.png)\n\nend\n";
      const ops = build(doc);
      const images = ofKind(ops, "image");

      expect(images).toStrictEqual([
        {
          alt: "shot",
          from: 0,
          kind: "image",
          src: "attachments/x.png",
          to: 26,
        },
      ]);
      expect(ofKind(ops, "hide")).toStrictEqual([]);
    });

    it("should drop to source when the cursor touches the image", () => {
      const doc = "![shot](attachments/x.png)\n";

      expect(ofKind(build(doc, 4), "image")).toStrictEqual([]);
    });
  });

  describe("tables", () => {
    it("should extract header and rows for the widget", () => {
      const doc = "| a | b |\n| - | - |\n| 1 | 2 |\n\nend\n";
      const tables = ofKind(build(doc), "table");

      expect(tables).toHaveLength(1);
      expect(tables[0]?.header).toStrictEqual(["a", "b"]);
      expect(tables[0]?.rows).toStrictEqual([["1", "2"]]);
    });

    it("should drop to source when the cursor is inside the table", () => {
      const doc = "| a | b |\n| - | - |\n| 1 | 2 |\n\nend\n";

      expect(ofKind(build(doc, 3), "table")).toStrictEqual([]);
    });
  });
});
