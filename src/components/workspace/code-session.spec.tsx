import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nullable, object, parse, string } from "valibot";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { closeTab, getTabState, openTab, refreshTabs } from "@/lib/tabs/store";

import { CodeSession } from "./code-session";

const ReadArgs = object({ known: nullable(string()) });

/**
 * Mount one code tab over a host whose file holds `text`. As the host does,
 * the mock revises the file with its content and answers null for a read at
 * the revision it already reported, counting the reads that carried text.
 */
function mount(
  text: () => Promise<string>,
  path = "/Users/me/config.json",
  active = true
) {
  const served = { count: 0 };
  mockIPC(async (command, args) => {
    if (command === "read_code_if_moved") {
      const { known } = parse(ReadArgs, args);
      const content = await text();
      const revision = `r:${content.length}:${content}`;

      if (known === revision) {
        return null;
      }

      served.count += 1;

      return { revision, text: content };
    }

    throw new Error(`unexpected command: ${command}`);
  });

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  openTab("code", path, true);
  const id = getTabState().activeId;
  onTestFinished(() => {
    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }

    client.clear();
    clearMocks();
  });
  render(
    <QueryClientProvider client={client}>
      <CodeSession active={active} tab={{ id, kind: "code", path }} />
      <Toaster />
    </QueryClientProvider>
  );

  return { client, id, served };
}

/** The block drawn, whatever runs the highlighter has split its text into. */
function shownBlock() {
  return document.querySelector("pre code");
}

async function shownText() {
  await waitFor(() => {
    expect(shownBlock()).not.toBeNull();
  });

  return shownBlock()?.textContent;
}

describe("code session", () => {
  it("should draw the file as one highlighted code block in the language its name says", async () => {
    mount(async () => '{\n  "name": "notras"\n}\n');

    expect(await shownText()).toBe('{\n  "name": "notras"\n}\n');

    const code = shownBlock();

    expect(code).toHaveClass("language-json");
    expect(code?.closest(".ProseMirror")).toHaveAttribute(
      "contenteditable",
      "false"
    );
    await waitFor(() => {
      expect(shownBlock()?.querySelector(".syntax-token")).not.toBeNull();
    });
  });

  it("should draw a file the highlighter has no lexer for as plain text", async () => {
    mount(async () => "just words\n", "/Users/me/notes.txt");

    expect(await shownText()).toBe("just words\n");
    expect(shownBlock()).toHaveClass("language-text");
  });

  it.each([
    { path: "/Users/me/notes.txt", wraps: "true" },
    { path: "/Users/me/minified.json", wraps: "false" },
  ])(
    "should wrap lines at the window width only for plain text, as $path shows",
    async ({ path, wraps }) => {
      mount(async () => "a line long enough to need wrapping\n", path);

      await shownText();

      expect(
        shownBlock()?.closest('[data-slot="scroll-area"]')
      ).toHaveAttribute("data-wrap", wraps);
    }
  );

  it("should say that the file is empty when it holds no text", async () => {
    mount(async () => "");

    expect(await screen.findByText("this file is empty")).toBeInTheDocument();
  });

  it("should say that it is reading the file until the read lands", async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    mount(vi.fn<() => Promise<string>>().mockReturnValue(promise));

    expect(await screen.findByText("reading this file")).toBeInTheDocument();

    resolve("const a = 1;\n");

    expect(await shownText()).toBe("const a = 1;\n");
    expect(screen.queryByText("reading this file")).not.toBeInTheDocument();
  });

  it("should say why the file could not be read and read again on request", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        kind: "failed",
        message: "This file is too large to show here",
      })
      .mockResolvedValue("const a = 1;\n");

    mount(read);

    expect(
      await screen.findByRole("button", { name: "try again" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("This file is too large to show here")
    ).not.toHaveLength(0);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "try again" }));

    expect(await shownText()).toBe("const a = 1;\n");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("should close the tab when the file is gone", async () => {
    const { id } = mount(
      vi
        .fn<() => Promise<string>>()
        .mockRejectedValue({ kind: "not-found", message: "No such file" })
    );

    await waitFor(() => {
      expect(getTabState().tabs.some((tab) => tab.id === id)).toBeFalsy();
    });
    expect(
      screen.queryByText("could not read this file")
    ).not.toBeInTheDocument();
  });

  it("should re-read a tab in the background when its refresher runs", async () => {
    let onDisk = "const a = 1;\n";
    const { id } = mount(async () => onDisk, "/Users/me/a.ts", false);

    expect(await shownText()).toBe("const a = 1;\n");
    onDisk = "const b = 2;\n";

    act(() => {
      refreshTabs((tab) => tab.id === id);
    });

    await waitFor(() => {
      expect(shownBlock()?.textContent).toBe("const b = 2;\n");
    });
    expect(document.querySelectorAll("pre code")).toHaveLength(1);
  });

  it("should keep the block when a refresh finds the file unmoved", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("const a = 1;\n");

    const { id, served } = mount(read);

    expect(await shownText()).toBe("const a = 1;\n");

    act(() => {
      refreshTabs((tab) => tab.id === id);
    });

    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
    });

    expect(served.count).toBe(1);
    expect(shownBlock()?.textContent).toBe("const a = 1;\n");
    expect(screen.queryByText("reading this file")).not.toBeInTheDocument();
    expect(
      screen.queryByText("could not read this file")
    ).not.toBeInTheDocument();
  });
});
