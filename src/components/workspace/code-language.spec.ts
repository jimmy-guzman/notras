import { describe, expect, it } from "vitest";

import { codeLanguage } from "./code-language";

describe(codeLanguage, () => {
  it.each([
    ["config.json", "json"],
    ["../src/cli.TS", "typescript"],
    ["script.py#L3", "python"],
    ["attachments/main.rs", "rust"],
    ["settings.yml", "yaml"],
    ["header.h", "c"],
    ["notes.txt", "text"],
    ["app.env", "text"],
    ["Cargo.lock", "text"],
  ])("should open %s as a code tab in %s", (destination, language) => {
    expect(codeLanguage(destination)).toBe(language);
  });

  it.each([
    "note.md",
    "data.csv",
    "data.tsv",
    "spec.pdf",
    "Makefile",
    "/abs/config.json",
    "https://x/config.json",
  ])("should leave %s to the tab or app it already has", (destination) => {
    expect(codeLanguage(destination)).toBeUndefined();
  });
});
