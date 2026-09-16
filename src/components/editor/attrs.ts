import type { JSONContent } from "@tiptap/core";
import type { Attrs, Node } from "@tiptap/pm/model";

/** Whether an attribute holds a string; the schema types attributes as `any`. */
export function hasString<K extends string>(
  attrs: Attrs | undefined,
  key: K
): attrs is Attrs & Record<K, string> {
  return typeof attrs?.[key] === "string";
}

function isContent(value: unknown): value is JSONContent {
  return typeof value === "object" && value !== null && "type" in value;
}

/** A node's JSON for the markdown serializer; ProseMirror types `toJSON` as `any`. */
export function contentOf(node: Node): JSONContent {
  const json: unknown = node.toJSON();
  if (!isContent(json)) {
    throw new Error("The node did not serialize");
  }
  return json;
}
