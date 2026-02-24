import { format } from "oxfmt";

import { formatMarkdown } from "./format-service";

vi.mock("oxfmt", async (importOriginal) => {
  const actual = await importOriginal<{ format: typeof format }>();

  return { ...actual, format: vi.fn(actual.format) };
});

describe("formatMarkdown", () => {
  it("should normalize extra spaces in headings", async () => {
    const input = "# heading one\n\n##  heading two\n\nsome text";
    const result = await formatMarkdown(input);

    expect(result).toBe("# heading one\n\n## heading two\n\nsome text\n");
  });

  it("should normalize list item spacing", async () => {
    const input = "-  item one\n-  item two\n-  item three";
    const result = await formatMarkdown(input);

    expect(result).toBe("- item one\n- item two\n- item three\n");
  });

  it("should add trailing newline", async () => {
    const input = "hello world";
    const result = await formatMarkdown(input);

    expect(result).toBe("hello world\n");
  });

  it("should handle empty string", async () => {
    const result = await formatMarkdown("");

    expect(result).toBe("");
  });

  it("should handle whitespace-only string", async () => {
    const result = await formatMarkdown("   \n\n  ");

    expect(result).toStrictEqual(expect.stringMatching(/^\s*$/));
  });

  it("should format bold and italic markers", async () => {
    const input = "some **bold** and *italic* text";
    const result = await formatMarkdown(input);

    expect(result).toBe("some **bold** and _italic_ text\n");
  });

  it("should handle multiline content", async () => {
    const input = "first paragraph\n\nsecond paragraph\n\nthird paragraph";
    const result = await formatMarkdown(input);

    expect(result).toBe(
      "first paragraph\n\nsecond paragraph\n\nthird paragraph\n",
    );
  });

  it("should preserve content when format throws", async () => {
    vi.mocked(format).mockRejectedValueOnce(new Error("format failed"));

    const input = "some content that fails to format";
    const result = await formatMarkdown(input);

    expect(result).toBe(input);
  });

  it("should return original content when oxfmt returns errors", async () => {
    vi.mocked(format).mockResolvedValueOnce({
      code: "bad output",
      errors: [
        {
          codeframe: null,
          helpMessage: null,
          labels: [],
          message: "parse error",
          severity: "Error" as never,
        },
      ],
    });

    const input = "original content";
    const result = await formatMarkdown(input);

    expect(result).toBe(input);
  });
});
