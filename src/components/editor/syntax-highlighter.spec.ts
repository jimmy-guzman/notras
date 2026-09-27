import { describe, expect, it, vi } from "vitest";

import {
  highlightCode,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";
import type {
  SyntaxJob,
  SyntaxRequest,
} from "@/components/editor/syntax-highlighter";

function job(fields: Partial<SyntaxJob> & Pick<SyntaxJob, "code">): SyntaxJob {
  return {
    distance: 0,
    document: 0,
    edited: false,
    language: "typescript",
    showing: false,
    signal: new AbortController().signal,
    ...fields,
  };
}

describe("syntax highlighter", () => {
  it("should resolve language aliases while leaving plain and unknown labels unhighlighted", () => {
    expect(syntaxLanguage("ts")).toBe("typescript");
    expect(syntaxLanguage("TSX")).toBe("tsx");
    expect(syntaxLanguage("sh")).toBe("shellscript");
    for (const label of [
      null,
      "",
      "text",
      "plain",
      "plaintext",
      "not-a-language",
    ]) {
      expect(syntaxLanguage(label)).toBeUndefined();
    }
  });

  it("should answer each request with its own tokens", async () => {
    const [json, typescript] = await Promise.all([
      highlightCode(job({ code: '{"a": 1}', document: 1, language: "json" })),
      highlightCode(job({ code: "const a = 1;", document: 2 })),
    ]);

    expect(json?.lines.flat()).toContainEqual({
      color: "var(--syntax-member)",
      length: 1,
      offset: 2,
    });
    expect(typescript?.lines.flat()).toContainEqual({
      color: "var(--syntax-keyword)",
      length: 5,
      offset: 0,
    });
  });

  it("should reject with the reason a grammar cannot load", async () => {
    await expect(
      highlightCode(job({ code: "x", document: 3, language: "not-a-language" }))
    ).rejects.toThrow(/not-a-language/u);
  });

  it("should post a showing editor's block first, then an edit, then the nearest block, then the earliest", async ({
    onTestFinished,
  }) => {
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    onTestFinished(() => {
      posted.mockRestore();
    });

    await Promise.all([
      highlightCode(job({ code: "const busy = 1;", document: 10 })),
      highlightCode(
        job({ code: "const far = 1;", distance: 900, document: 11 })
      ),
      highlightCode(
        job({ code: "const near = 1;", distance: 100, document: 12 })
      ),
      highlightCode(
        job({
          code: "const edit = 1;",
          distance: 900,
          document: 13,
          edited: true,
        })
      ),
      highlightCode(
        job({
          code: "const shown = 1;",
          distance: 900,
          document: 14,
          showing: true,
        })
      ),
    ]);

    expect(
      posted.mock.calls.map(
        ([request]: [SyntaxRequest, ...unknown[]]) => request.code
      )
    ).toStrictEqual([
      "const shown = 1;",
      "const edit = 1;",
      "const busy = 1;",
      "const near = 1;",
      "const far = 1;",
    ]);
  });

  it("should ask once with the latest text for a block edited again before its turn", async ({
    onTestFinished,
  }) => {
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    onTestFinished(() => {
      posted.mockRestore();
    });

    const busy = highlightCode(job({ code: "const busy = 1;", document: 20 }));
    const stale = highlightCode(
      job({ code: "const stale = 1;", document: 21 })
    );
    const latest = highlightCode(job({ code: "let stale = 1;", document: 21 }));

    await expect(stale).resolves.toBeUndefined();
    await expect(latest).resolves.toMatchObject({ start: 0, tail: 0 });
    await busy;
    expect(
      posted.mock.calls.map(
        ([request]: [SyntaxRequest, ...unknown[]]) => request.code
      )
    ).toStrictEqual(["const busy = 1;", "let stale = 1;"]);
  });

  it("should never post a job aborted while it waits", async ({
    onTestFinished,
  }) => {
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    onTestFinished(() => {
      posted.mockRestore();
    });
    const aborter = new AbortController();

    const busy = highlightCode(job({ code: "const busy = 1;", document: 30 }));
    const withdrawn = highlightCode(
      job({ code: "const gone = 1;", document: 31, signal: aborter.signal })
    );
    const kept = highlightCode(job({ code: "const kept = 1;", document: 32 }));
    aborter.abort();

    await expect(withdrawn).resolves.toBeUndefined();
    await Promise.all([busy, kept]);
    expect(
      posted.mock.calls.map(
        ([request]: [SyntaxRequest, ...unknown[]]) => request.code
      )
    ).toStrictEqual(["const busy = 1;", "const kept = 1;"]);
  });
});
