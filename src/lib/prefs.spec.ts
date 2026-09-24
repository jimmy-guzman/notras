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

describe("focus mode", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.removeItem("focus-mode");
  });

  afterEach(() => {
    localStorage.removeItem("focus-mode");
  });

  it("should restore focus mode across launches", async () => {
    localStorage.setItem("focus-mode", "true");
    const { useFocusMode } = await import("@/lib/prefs");
    const { result } = renderHook(useFocusMode);
    expect(result.current).toBeTruthy();
  });

  it("should start off and log when reading the preference fails", async () => {
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
    const { useFocusMode } = await import("@/lib/prefs");
    const { result } = renderHook(useFocusMode);

    expect(result.current).toBeFalsy();
    await waitFor(() => {
      expect(logged).toMatchObject([
        {
          args: {
            message: "could not read focus mode: Storage access is denied",
          },
          command: "plugin:log|log",
        },
      ]);
    });
  });

  it("should toggle and report when remembering the preference fails", async () => {
    const { Toaster: FreshToaster } = await import("@/components/ui/toast");
    render(createElement(FreshToaster));
    const { toggleFocusMode, useFocusMode } = await import("@/lib/prefs");
    const { result } = renderHook(useFocusMode);
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    onTestFinished(() => {
      write.mockRestore();
    });

    act(() => {
      toggleFocusMode();
    });

    expect(result.current).toBeTruthy();
    expect(
      await screen.findByText("could not remember focus mode")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });
});
