import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportPdf } from "@/lib/export-pdf";

function surfaceOf(html: string) {
  const surface = document.createElement("div");

  surface.className = "ProseMirror";
  surface.innerHTML = html;
  document.body.append(surface);

  return surface;
}

describe("export pdf", () => {
  afterEach(() => {
    clearMocks();
    document.body.replaceChildren();
  });

  it("should write nothing when the save dialog is cancelled", async () => {
    const invoke = vi.fn<Parameters<typeof mockIPC>[0]>((command) => {
      if (command === "plugin:dialog|save") {
        return null;
      }
      throw new Error(`unexpected command ${command}`);
    });
    mockIPC(invoke);
    const surface = surfaceOf("<p>hello</p>");

    await expect(
      exportPdf(surface, "hello", "hello", async () => {})
    ).resolves.toBeNull();

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({
      options: {
        defaultPath: "hello.pdf",
        filters: [{ extensions: ["pdf"], name: "pdf" }],
      },
    });
    expect(document.querySelector(".print-sheet")).toBeNull();
  });

  it("should print a copy of the surface at the chosen path and remove it after", async () => {
    let printed:
      | { state: Element | null; text: string | undefined }
      | undefined;
    mockIPC((command, args) => {
      if (command === "plugin:dialog|save") {
        return "/exports/hello.pdf";
      }
      expect(command).toBe("export_pdf");
      expect(args).toStrictEqual({
        path: "/exports/hello.pdf",
        title: "Hello",
      });
      const sheet = document.querySelector("body > .print-sheet");
      printed = {
        state:
          sheet?.querySelector(
            ".note-find-open, .note-find-match, .note-find-active, .ProseMirror-selectednode"
          ) ?? null,
        text: sheet?.textContent,
      };
      return null;
    });
    const surface = surfaceOf(
      '<p><span class="note-find-match note-find-active">hello</span></p><img class="ProseMirror-selectednode" alt="">'
    );
    surface.classList.add("note-find-open");

    await expect(
      exportPdf(surface, "hello", "Hello", async () => {})
    ).resolves.toBe("/exports/hello.pdf");

    expect(printed).toStrictEqual({ state: null, text: "hello" });
    expect(document.querySelector(".print-sheet")).toBeNull();
    expect(surface.isConnected).toBeTruthy();
  });

  it("should copy the surface once it is painted after the dialog closes", async () => {
    const surface = surfaceOf("<pre>const</pre>");
    const painting = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const order: string[] = [];
    let printed: string | null | undefined;
    mockIPC((command) => {
      if (command === "plugin:dialog|save") {
        order.push("dialog");
        return "/exports/hello.pdf";
      }
      printed = document.querySelector(
        ".print-sheet .syntax-token"
      )?.textContent;
      return null;
    });

    const exported = exportPdf(surface, "hello", "hello", async () => {
      order.push("painted");
      painting.resolve(undefined);
      await released.promise;
      surface.innerHTML = '<pre><span class="syntax-token">const</span></pre>';
    });
    await painting.promise;
    expect(order).toStrictEqual(["dialog", "painted"]);
    expect(document.querySelector(".print-sheet")).toBeNull();
    released.resolve(undefined);

    await expect(exported).resolves.toBe("/exports/hello.pdf");
    expect(printed).toBe("const");
  });

  it("should remove the sheet and carry the reason when the write fails", async () => {
    const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
      kind: "failed",
      message: "the pdf could not be written",
    });
    mockIPC(async (command) => {
      if (command === "plugin:dialog|save") {
        return "/exports/hello.pdf";
      }
      return await refused();
    });
    const surface = surfaceOf("<p>hello</p>");

    await expect(
      exportPdf(surface, "hello", "hello", async () => {})
    ).rejects.toMatchObject({
      message: "the pdf could not be written",
    });
    expect(document.querySelector(".print-sheet")).toBeNull();
  });
});
