import { common, createLowlight } from "lowlight";
import { describe, expect, it } from "vitest";

import { markdownWithFrontmatter } from "./markdown-frontmatter";

const lowlight = createLowlight({
  ...common,
  markdown: markdownWithFrontmatter,
});

type Content = ReturnType<typeof lowlight.highlight>["children"][number];

/** Every run of text a reader sees, paired with the class painting it. */
const tokens = (source: string) => {
  const flat: { text: string; token: string }[] = [];

  const walk = (node: Content, inherited: string) => {
    if (node.type === "text") {
      flat.push({ text: node.value, token: inherited });

      return;
    }

    if (node.type !== "element") {
      return;
    }

    const own = node.properties.className;
    const token = Array.isArray(own) ? own.join(" ") : inherited;

    for (const child of node.children) {
      walk(child, token);
    }
  };

  for (const child of lowlight.highlight("markdown", source).children) {
    walk(child, "");
  }

  return flat;
};

describe("markdown with frontmatter", () => {
  it("should highlight a frontmatter key as a yaml attribute", () => {
    expect(tokens("---\npinned: true\n---\n# a title")).toContainEqual({
      text: "pinned:",
      token: "hljs-attr",
    });
  });

  it("should not read a closing --- as a setext heading", () => {
    expect(tokens("---\ntags: [notras]\n---\n# a title")).not.toContainEqual({
      text: "tags: [notras]\n---",
      token: "hljs-section",
    });
  });

  it("should leave a --- pair below the frontmatter unhighlighted", () => {
    expect(
      tokens("---\npinned: true\n---\nbefore\n\n---\n\nafter")
    ).toContainEqual({ text: "\nbefore\n\n---\n\nafter", token: "" });
  });

  it("should close a frontmatter block on a ... delimiter", () => {
    expect(tokens("---\npinned: true\n...\n# a title")).toContainEqual({
      text: "# a title",
      token: "hljs-section",
    });
  });

  it("should close a frontmatter block on a delimiter with trailing spaces", () => {
    expect(tokens("---\npinned: true\n---  \n# a title")).toContainEqual({
      text: "# a title",
      token: "hljs-section",
    });
  });

  it("should still highlight a heading after the frontmatter block", () => {
    expect(tokens("---\npinned: true\n---\n# a title")).toContainEqual({
      text: "# a title",
      token: "hljs-section",
    });
  });
});
