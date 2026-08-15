import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

import { buildLivePreviewDecorations } from "./live-preview";

function build(doc: string, cursor = doc.length, head?: number) {
  const state = EditorState.create({
    doc,
    extensions: [markdown()],
    selection:
      head === undefined ? { anchor: cursor } : { anchor: cursor, head },
  });

  ensureSyntaxTree(state, doc.length, 5000);

  return buildLivePreviewDecorations(state, [{ from: 0, to: doc.length }]);
}

function hiddenTexts(doc: string, result: ReturnType<typeof build>) {
  return result.hidden.map((range) => {
    return doc.slice(range.from, range.to);
  });
}

describe("buildLivePreviewDecorations", () => {
  it("should hide marks on elements the cursor is not touching", () => {
    const doc = "## heading\n\n**bold** and `code`\n\nend\n";
    const result = build(doc);

    expect(hiddenTexts(doc, result)).toStrictEqual([
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
    const result = build(doc, insideBold);

    expect(hiddenTexts(doc, result)).toStrictEqual(["## "]);
  });

  it("should reveal on inclusive element boundaries", () => {
    const doc = "**bold** x\n";
    const atStart = build(doc, 0);

    expect(hiddenTexts(doc, atStart)).toStrictEqual([]);
  });

  it("should hide link brackets and url, leaving the text", () => {
    const doc = "see [notes](https://example.com) ok\n";
    const result = build(doc);

    expect(hiddenTexts(doc, result)).toStrictEqual([
      "[",
      "]",
      "(",
      "https://example.com",
      ")",
    ]);
  });

  it("should never hide autolink urls or fenced code marks", () => {
    const doc = "<https://example.com>\n\n```ts\nconst a = 1\n```\n\nend\n";
    const result = build(doc);

    expect(result.hidden).toStrictEqual([]);
  });

  it("should hide quote marks and tag quote lines", () => {
    const doc = "> quoted\n\nend\n";
    const result = build(doc);

    expect(hiddenTexts(doc, result)).toStrictEqual(["> "]);
    expect(result.quoteLines).toStrictEqual([0]);
  });

  it("should keep quote lines tagged while the cursor is on them", () => {
    const doc = "> quoted\n";
    const result = build(doc, 3);

    expect(result.hidden).toStrictEqual([]);
    expect(result.quoteLines).toStrictEqual([0]);
  });

  it("should reveal every element a selection spans", () => {
    const doc = "## a\n\n**b** and `c`\n";
    const result = build(doc, 0, doc.length);

    expect(result.hidden).toStrictEqual([]);
  });

  it("should leave setext heading underlines alone", () => {
    const doc = "title\n-----\n\nend\n";
    const result = build(doc);

    expect(result.hidden).toStrictEqual([]);
  });
});
