import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/ui/toast";
import { setNoteTags } from "@/data/set-note-tags";

import { useNoteTags } from "./use-note-tags";

// The furthest boundary a hook test can reach: below this sit the Effect
// runtime and a Tauri command, neither of which exists here.
vi.mock("@/data/set-note-tags", () => ({ setNoteTags: vi.fn() }));

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Live = ReturnType<typeof useNoteTags>;

/** Drive the real hook in a real root, the way `use-autosave.spec.ts` does. */
function mountNoteTags() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const root = createRoot(document.createElement("div"));
  let live: Live | undefined;

  function Probe({ path, tags }: { path: string; tags: string[] }) {
    live = useNoteTags(path, tags);

    return null;
  }

  return {
    read: () => {
      if (live === undefined) {
        throw new Error("the probe never rendered");
      }

      return live;
    },
    show: (path: string, tags: string[]) => {
      act(() => {
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(Probe, { path, tags })
          )
        );
      });
    },
  };
}

/** A write that hangs until the test decides its fate. */
function deferWrite() {
  let fail: (error: Error) => void = () => undefined;

  vi.mocked(setNoteTags).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })
  );

  return (error: Error) => {
    fail(error);
  };
}

/**
 * `mutate` awaits `onMutate` before it reaches the write, and the rejection
 * then walks Query's callback chain, so both need a turn of the loop.
 */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe("useNoteTags", () => {
  beforeEach(() => {
    vi.mocked(setNoteTags).mockReset();
    vi.restoreAllMocks();
  });

  it("should keep the showing note's pending tags when an earlier note's write fails", async () => {
    const failFirst = deferWrite();

    deferWrite();
    const reported = vi.spyOn(toast, "add").mockReturnValue("");

    const { read, show } = mountNoteTags();

    show("a.md", []);
    act(() => {
      read().changeTags(["one"]);
    });
    await flush();

    show("b.md", ["two"]);
    act(() => {
      read().changeTags(["two", "three"]);
    });
    await flush();

    failFirst(new Error("disk said no"));
    await flush();

    expect(read().tags).toEqual(["two", "three"]);
    expect(reported).not.toHaveBeenCalled();
  });

  it("should roll the showing note back to its saved tags when its own write fails", async () => {
    const failOnly = deferWrite();
    const reported = vi.spyOn(toast, "add").mockReturnValue("");

    const { read, show } = mountNoteTags();

    show("a.md", ["kept"]);
    act(() => {
      read().changeTags(["kept", "added"]);
    });
    await flush();

    expect(read().tags).toEqual(["kept", "added"]);
    expect(vi.mocked(setNoteTags)).toHaveBeenCalledTimes(1);

    failOnly(new Error("disk said no"));
    await flush();

    expect(read().tags).toEqual(["kept"]);
    expect(reported).toHaveBeenCalledTimes(1);
  });
});
