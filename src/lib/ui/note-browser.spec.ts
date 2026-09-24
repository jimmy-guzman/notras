import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import { Toaster } from "@/components/ui/toast";
import {
  readNoteBrowserWidth,
  rememberNoteBrowserWidth,
} from "@/lib/ui/note-browser";

describe("note browser startup", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.removeItem("note-browser-open");
  });

  afterEach(() => {
    localStorage.removeItem("note-browser-open");
  });

  it.each([
    { open: false, saved: null },
    { open: false, saved: "false" },
    { open: true, saved: "true" },
  ])("should restore visibility from $saved", async ({ open, saved }) => {
    if (saved !== null) {
      localStorage.setItem("note-browser-open", saved);
    }
    const { useNoteBrowser } = await import("@/lib/ui/note-browser");
    const { result } = renderHook(useNoteBrowser);
    expect(result.current).toBe(open);
  });

  it("should start collapsed and log when reading the visibility preference fails", async () => {
    const logged: { args: unknown; command: string }[] = [];
    mockIPC((command, args) => {
      logged.push({ args, command });
    });
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Storage access is denied", "SecurityError");
    });
    onTestFinished(() => {
      read.mockRestore();
      clearMocks();
    });
    const { useNoteBrowser } = await import("@/lib/ui/note-browser");
    const { result } = renderHook(useNoteBrowser);

    expect(result.current).toBeFalsy();
    await waitFor(() => {
      expect(logged).toMatchObject([
        {
          args: {
            message:
              "could not read note browser visibility: Storage access is denied",
          },
          command: "plugin:log|log",
        },
      ]);
    });
  });

  it("should toggle and report when remembering visibility fails", async () => {
    const { Toaster: FreshToaster } = await import("@/components/ui/toast");
    render(createElement(FreshToaster));
    const { toggleNoteBrowser, useNoteBrowser } =
      await import("@/lib/ui/note-browser");
    const { result } = renderHook(useNoteBrowser);
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    onTestFinished(() => {
      write.mockRestore();
    });

    act(() => {
      toggleNoteBrowser();
    });

    expect(result.current).toBeTruthy();
    expect(
      await screen.findByText("could not remember note browser")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });
});

describe("note browser width", () => {
  afterEach(() => {
    localStorage.removeItem("note-browser-width");
  });

  it("should start at 296 pixels without a saved width", () => {
    expect(readNoteBrowserWidth()).toBe(296);
  });

  it("should start at 296 pixels from a saved width out of range", () => {
    localStorage.setItem("note-browser-width", "900");

    expect(readNoteBrowserWidth()).toBe(296);
  });

  it("should report when remembering the width fails", async () => {
    render(createElement(Toaster));
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    onTestFinished(() => {
      write.mockRestore();
    });

    rememberNoteBrowserWidth(360);

    expect(
      await screen.findByText("could not remember note browser width")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });

  it("should restore a chosen width from storage", () => {
    rememberNoteBrowserWidth(360);
    expect(localStorage.getItem("note-browser-width")).toBe("360");
    expect(readNoteBrowserWidth()).toBe(360);
  });
});
