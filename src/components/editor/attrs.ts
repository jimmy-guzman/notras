import type { Attrs } from "@tiptap/pm/model";

/** Whether an attribute holds a string; the schema types attributes as `any`. */
export function hasString<K extends string>(
  attrs: Attrs | undefined,
  key: K
): attrs is Attrs & Record<K, string> {
  return typeof attrs?.[key] === "string";
}
