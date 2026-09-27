import type { JSONContent } from "@tiptap/core";
import type { Attrs, Node } from "@tiptap/pm/model";

/** Whether an attribute holds a string; the schema types attributes as `any`. */
export function hasString<K extends string>(
  attrs: Attrs | undefined,
  key: K
): attrs is Attrs & Record<K, string> {
  return typeof attrs?.[key] === "string";
}

/** Whether an attribute holds a number; the schema types attributes as `any`. */
export function hasNumber<K extends string>(
  attrs: Attrs | undefined,
  key: K
): attrs is Attrs & Record<K, number> {
  return typeof attrs?.[key] === "number";
}

/** Whether a value is an attribute record; a render context types them as `any`. */
export function isAttrs(value: unknown): value is Attrs {
  return typeof value === "object" && value !== null;
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
