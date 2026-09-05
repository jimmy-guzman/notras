import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";
import { getNote } from "@/data/get-note";
import { tabPanelId } from "@/lib/tabs/tab";

import { NoteSession } from "./note-session";

// The furthest boundary a component test can reach: below this sit the Effect
// runtime and a Tauri command, neither of which exists here.
vi.mock("@/data/get-note", () => ({ getNote: vi.fn() }));

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const tab = { id: "t1", kind: "note", path: "a.md" } as const;

const roots: Root[] = [];

/** Mount one session in a real root, the way `use-note-tags.spec.ts` does. */
function mountSession() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);

  roots.push(root);
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(NoteSession, { active: true, tab })
      )
    );
  });
}

/**
 * Let the read reject and React commit what follows. Bounded polling rather
 * than one tick, since under a loaded suite the rejection can take several.
 */
async function settle() {
  for (let tick = 0; tick < 40 && panel() === null; tick += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll has to let one tick finish before it looks at the DOM again
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    });
  }
}

function panel() {
  return document.getElementById(tabPanelId(tab.id));
}

describe("NoteSession", () => {
  beforeEach(() => {
    vi.mocked(getNote).mockReset();
    vi.mocked(getNote).mockRejectedValue(
      new FileError({
        kind: "failed",
        message: "permission denied",
      })
    );
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = "";
  });

  it("should show why the first read failed and offer to try again", async () => {
    mountSession();
    await settle();

    expect(panel()?.getAttribute("role")).toBe("tabpanel");
    expect(panel()?.textContent).toContain("could not read this note");
    expect(panel()?.textContent).toContain("permission denied");
    expect(panel()?.querySelector("button")?.textContent).toBe("try again");
  });

  it("should read again when asked", async () => {
    mountSession();
    await settle();

    await act(async () => {
      panel()?.querySelector("button")?.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    await settle();

    expect(getNote).toHaveBeenCalledTimes(2);
    expect(panel()?.textContent).toContain("could not read this note");
  });
});
