import { describe, expect, it } from "vitest";
import { parseTagQuery } from "./tag-query";

describe("parseTagQuery", () => {
  it("should return undefined for an ordinary search", () => {
    expect(parseTagQuery("budget")).toBeUndefined();
  });

  it("should return undefined for an empty query", () => {
    expect(parseTagQuery("")).toBeUndefined();
  });

  it("should return an empty tag for a bare hash", () => {
    expect(parseTagQuery("#")).toStrictEqual({ query: "", tag: "" });
  });

  it("should read a partial tag token", () => {
    expect(parseTagQuery("#wo")).toStrictEqual({ query: "", tag: "wo" });
  });

  it("should lowercase the tag token", () => {
    expect(parseTagQuery("#Work")).toStrictEqual({ query: "", tag: "work" });
  });

  it("should split free text after the tag token", () => {
    expect(parseTagQuery("#work budget")).toStrictEqual({
      query: "budget",
      tag: "work",
    });
  });

  it("should keep spaces inside the free text", () => {
    expect(parseTagQuery("#work q3 budget")).toStrictEqual({
      query: "q3 budget",
      tag: "work",
    });
  });

  it("should end the tag token on a tab", () => {
    expect(parseTagQuery("#work\tbudget")).toStrictEqual({
      query: "budget",
      tag: "work",
    });
  });

  it("should end the tag token on a newline", () => {
    expect(parseTagQuery("#work\nbudget")).toStrictEqual({
      query: "budget",
      tag: "work",
    });
  });

  it("should collapse a run of mixed whitespace", () => {
    expect(parseTagQuery("#work \t q3 budget")).toStrictEqual({
      query: "q3 budget",
      tag: "work",
    });
  });

  it("should treat a trailing space as an empty query", () => {
    expect(parseTagQuery("#work ")).toStrictEqual({ query: "", tag: "work" });
  });

  it("should ignore leading whitespace before the hash", () => {
    expect(parseTagQuery("  #work")).toStrictEqual({ query: "", tag: "work" });
  });

  it("should not treat a mid-query hash as a tag token", () => {
    expect(parseTagQuery("budget #work")).toBeUndefined();
  });
});
