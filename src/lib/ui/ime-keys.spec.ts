import { renderHook } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { useImeKeys } from "./ime-keys";

describe("ime keys", () => {
  it("should skip a key typed while composing", () => {
    const handled: string[] = [];
    const { result } = renderHook(() => useImeKeys());

    const handle = result.current.withoutImeKeys((event: KeyboardEvent) => {
      handled.push(event.key);
    });

    handle(new KeyboardEvent("keydown", { isComposing: true, key: "Enter" }));

    expect(handled).toStrictEqual([]);
  });

  it("should skip only the first key after compositionend on WebKit", () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue(
      "Apple Computer, Inc."
    );
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const handled: string[] = [];
    const { result } = renderHook(() => useImeKeys());

    const handle = result.current.withoutImeKeys((event: KeyboardEvent) => {
      handled.push(event.key);
    });

    result.current.onCompositionEnd(new CompositionEvent("compositionend"));
    handle(new KeyboardEvent("keydown", { key: "Enter" }));
    handle(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handled).toStrictEqual(["Escape"]);
  });

  it("should pass a key 500 ms after compositionend on WebKit", () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue(
      "Apple Computer, Inc."
    );
    vi.useFakeTimers({ toFake: ["performance"] });
    onTestFinished(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });
    const handled: string[] = [];
    const { result } = renderHook(() => useImeKeys());

    const handle = result.current.withoutImeKeys((event: KeyboardEvent) => {
      handled.push(event.key);
    });

    result.current.onCompositionEnd(new CompositionEvent("compositionend"));
    vi.advanceTimersByTime(500);
    handle(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(handled).toStrictEqual(["Enter"]);
  });

  it("should pass the next key after a confirm marked composing outside WebKit", () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue("Google Inc.");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const handled: string[] = [];
    const { result } = renderHook(() => useImeKeys());

    const handle = result.current.withoutImeKeys((event: KeyboardEvent) => {
      handled.push(event.key);
    });

    handle(new KeyboardEvent("keydown", { isComposing: true, key: "Enter" }));
    result.current.onCompositionEnd(new CompositionEvent("compositionend"));
    handle(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handled).toStrictEqual(["Escape"]);
  });
});
