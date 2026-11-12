import { describe, expect, it } from "vitest";

import { codeLanguage } from "./code-language";

describe(codeLanguage, () => {
  it.each([
    ["config.json", "json"],
    ["../src/cli.TS", "ts"],
    ["script.py#L3", "py"],
    ["attachments/main.rs", "rs"],
    ["settings.yml", "yml"],
    ["header.h", "h"],
    ["notes.txt", "text"],
    ["app.env", "env"],
    ["Cargo.lock", "text"],
  ])("should open %s as a code tab in %s", (destination, language) => {
    expect(codeLanguage(destination)).toBe(language);
  });

  it.each([
    "note.md",
    "data.csv",
    "data.tsv",
    "spec.pdf",
    "logo.svg",
    "Makefile",
    "/abs/config.json",
    "https://x/config.json",
  ])("should leave %s to the tab or app it already has", (destination) => {
    expect(codeLanguage(destination)).toBeUndefined();
  });
});
