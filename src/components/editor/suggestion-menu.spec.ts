import type { SuggestionFloatingUiOptions } from "@tiptap/suggestion";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { suggestionMenuOptions } from "./suggestion-menu";

type Middleware = NonNullable<
  SuggestionFloatingUiOptions["middleware"]
>[number];

type State = Parameters<Extract<Middleware, object>["fn"]>[0];

function windowOf(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

async function place(
  { x, y }: { x: number; y: number },
  query: { height: number; top: number },
  size: { height: number; width: number },
  floating = document.createElement("div")
) {
  const middleware = suggestionMenuOptions(() => []).floatingUi
    ?.middleware?.[0];

  if (!middleware) {
    throw new Error("the menus have no placement middleware");
  }

  const rects = {
    floating: { ...size, x: 0, y: 0 },
    reference: { height: query.height, width: 40, x: 100, y: query.top },
  };

  const state: State = {
    elements: { floating, reference: document.createElement("span") },
    initialPlacement: "bottom-start",
    middlewareData: {},
    placement: "bottom-start",
    platform: {
      detectOverflow: async () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
      getClippingRect: () => ({ height: 630, width: 700, x: 0, y: 0 }),
      getDimensions: () => size,
      getElementRects: () => rects,
    },
    rects,
    strategy: "fixed",
    x,
    y,
  };

  const first = await middleware.fn(state);

  return first.reset === undefined ? first : await middleware.fn(state);
}

describe("suggestion menu placement", () => {
  it("should open above the query when below would cross the bottom margin", async () => {
    windowOf(700, 630);

    expect(
      await place(
        { x: 100, y: 524 },
        { height: 20, top: 500 },
        { height: 100, width: 200 }
      )
    ).toStrictEqual({ x: 100, y: 396 });
  });

  it("should stay below the query when it ends exactly at the bottom margin", async () => {
    windowOf(700, 630);

    expect(
      await place(
        { x: 100, y: 524 },
        { height: 20, top: 500 },
        { height: 98, width: 200 }
      )
    ).toStrictEqual({ x: 100, y: 524 });
  });

  it.each([
    ["below", 120, "114px"],
    ["above", 140, "128px"],
  ])(
    "should shorten the menu to the room %s a tall query when that side is roomier",
    async (_side, top, room) => {
      windowOf(700, 360);
      const menu = document.createElement("div");

      await place(
        { x: 100, y: top + 118 },
        { height: 114, top },
        { height: 100, width: 200 },
        menu
      );

      expect(menu.style.getPropertyValue("--menu-room")).toBe(room);
    }
  );

  it.each([
    [-20, 8],
    [650, 492],
  ])(
    "should keep a menu placed at x %i inside the side margins",
    async (x, clamped) => {
      windowOf(700, 630);

      expect(
        await place(
          { x, y: 124 },
          { height: 20, top: 100 },
          { height: 100, width: 200 }
        )
      ).toStrictEqual({ x: clamped, y: 124 });
    }
  );
});
