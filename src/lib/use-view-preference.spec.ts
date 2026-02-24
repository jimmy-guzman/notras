import { act, renderHook } from "@testing-library/react";

import { useViewPreference } from "./use-view-preference";

describe("useViewPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should return grid as the default view", () => {
    const { result } = renderHook(() => useViewPreference());

    expect(result.current[0]).toBe("grid");
  });

  it("should return the stored view from localStorage", () => {
    localStorage.setItem("notras:notes-view", "list");

    const { result } = renderHook(() => useViewPreference());

    expect(result.current[0]).toBe("list");
  });

  it("should update the view when setView is called", () => {
    const { result } = renderHook(() => useViewPreference());

    act(() => {
      result.current[1]("list");
    });

    expect(result.current[0]).toBe("list");
    expect(localStorage.getItem("notras:notes-view")).toBe("list");
  });

  it("should fall back to grid for invalid localStorage values", () => {
    localStorage.setItem("notras:notes-view", "invalid");

    const { result } = renderHook(() => useViewPreference());

    expect(result.current[0]).toBe("grid");
  });

  it("should be hydrated after initial render", () => {
    const { result } = renderHook(() => useViewPreference());

    expect(result.current[2]).toBe(true);
  });
});
