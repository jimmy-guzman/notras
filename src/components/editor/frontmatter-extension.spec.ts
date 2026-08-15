import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

import { frontmatterExtension } from "./frontmatter-extension";

function parseNodes(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({ base: markdownLanguage, extensions: [frontmatterExtension] }),
    ],
  });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  const names: string[] = [];

  tree?.iterate({
    enter: (node) => {
      names.push(node.name);
    },
  });

  return names;
}

describe("frontmatterExtension", () => {
  it("should parse a leading frontmatter block instead of a setext heading", () => {
    const names = parseNodes("---\npinned: true\ntags: [a]\n---\n# body\n");

    expect(names).toContain("Frontmatter");
    expect(
      names.filter((name) => {
        return name === "FrontmatterMark";
      }),
    ).toHaveLength(2);
    expect(names).not.toContain("SetextHeading2");
    expect(names).not.toContain("HorizontalRule");
    expect(names).toContain("ATXHeading1");
  });

  it("should leave a mid-document divider as a horizontal rule", () => {
    const names = parseNodes("# hi\n\ntext\n\n---\n\nmore\n");

    expect(names).not.toContain("Frontmatter");
    expect(names).toContain("HorizontalRule");
  });

  it("should not claim documents that merely start with a paragraph", () => {
    const names = parseNodes("hello\n---\n");

    expect(names).not.toContain("Frontmatter");
  });

  it("should accept the ... closing delimiter", () => {
    const names = parseNodes("---\npinned: true\n...\nbody\n");

    expect(names).toContain("Frontmatter");
    expect(
      names.filter((name) => {
        return name === "FrontmatterMark";
      }),
    ).toHaveLength(2);
  });
});
