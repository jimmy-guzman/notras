import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveStatus } from "./use-autosave";

import { useAutosave } from "./use-autosave";

const AUTOSAVE_DELAY_MS = 800;

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface Live {
  flush: () => Promise<boolean>;
  status: SaveStatus;
  type: (content: string) => void;
}

/**
 * Drive the real hook in a real root, so what is under test is the hook a tab
 * uses. `@testing-library/react` does this too, and is a dependency this repo
 * does not carry for one spec.
 */
function mountAutosave(
  write: (path: string, content: string) => Promise<Date>
) {
  const root = createRoot(document.createElement("div"));
  let enabled = true;
  let live: Live = {
    flush: () => Promise.reject(new Error("the probe never rendered")),
    status: "saved",
    type: () => undefined,
  };

  function Probe() {
    const autosave = useAutosave("note.md", {
      enabled,
      onSaved: () => undefined,
      write,
    });

    live = {
      flush: autosave.flush,
      status: autosave.status,
      type: autosave.onChange,
    };

    return null;
  }

  const render = () => {
    act(() => {
      root.render(createElement(Probe));
    });
  };

  render();

  return {
    async flush() {
      let landed = false;

      await act(async () => {
        landed = await live.flush();
      });

      return landed;
    },
    setEnabled(next: boolean) {
      enabled = next;
      render();
    },
    /**
     * Re-render without letting passive effects flush, which is the window a
     * debounce timer can fire in: React commits, then schedules its passive
     * work as a separate task.
     */
    async setEnabledMidCommit(next: boolean) {
      enabled = next;
      root.render(createElement(Probe));
      await Promise.resolve();
    },
    /** Let the 800ms debounce elapse and any write it starts settle. */
    async settle() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      });
    },
    /**
     * Start a flush and hand its promise back, so a second flush can be
     * started while the first write is still in flight. Deliberately not
     * `async`: an async method would adopt the promise it returns and wait for
     * the write, which is the opposite of what a caller wants here.
     */
    startFlush() {
      let pending: Promise<boolean> | undefined;

      act(() => {
        pending = live.flush();
      });

      if (pending === undefined) {
        throw new Error("the flush never started");
      }

      return pending;
    },
    get status() {
      return live.status;
    },
    type(content: string) {
      act(() => {
        live.type(content);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should write the buffer once the debounce elapses", async () => {
    const written: string[] = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return Promise.resolve(new Date(1));
    });

    harness.type("hello");
    await harness.settle();

    expect(written).toStrictEqual(["hello"]);
    expect(harness.status).toBe("saved");

    harness.unmount();
  });

  it("should not write while disabled", async () => {
    const written: string[] = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return Promise.resolve(new Date(1));
    });

    harness.setEnabled(false);
    harness.type("typed while the file was gone");
    await harness.settle();

    expect(written).toStrictEqual([]);

    harness.unmount();
  });

  it("should report the buffer safe to quit while holding text it cannot write", async () => {
    const written: string[] = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return Promise.resolve(new Date(1));
    });

    harness.setEnabled(false);
    harness.type("the file is gone but this is on screen");

    // A false here cancels the quit, which would leave the app unquittable
    // while the tab is open, so the buffer is abandoned rather than blocking.
    await expect(harness.flush()).resolves.toBe(true);
    expect(written).toStrictEqual([]);

    harness.unmount();
  });

  it("should not write through a timer that fires before effects flush", async () => {
    const written: string[] = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return Promise.resolve(new Date(1));
    });

    harness.type("about to be deleted");
    await harness.setEnabledMidCommit(false);
    await harness.settle();

    expect(written).toStrictEqual([]);

    harness.unmount();
  });

  it("should write what is on screen after being re-enabled", async () => {
    const written: string[] = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return Promise.resolve(new Date(1));
    });

    harness.type("first");
    await harness.settle();

    harness.setEnabled(false);
    harness.type("first, plus everything typed while the file was gone");
    harness.setEnabled(true);
    await harness.flush();

    expect(written).toStrictEqual([
      "first",
      "first, plus everything typed while the file was gone",
    ]);

    harness.unmount();
  });

  it("should land overlapping writes in the order they were flushed", async () => {
    const written: string[] = [];
    const landWrite: Array<() => void> = [];
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      return new Promise<Date>((resolve) => {
        landWrite.push(() => {
          resolve(new Date(1));
        });
      });
    });

    /** Run every chain link that can run, without landing a write. */
    const advance = async () => {
      await act(async () => {
        await Promise.resolve();
      });
    };

    /** Let the write the fake is holding at `index` resolve. */
    const land = async (index: number) => {
      const resolve = landWrite[index];

      if (resolve === undefined) {
        throw new Error(`write ${index} never reached the fake`);
      }

      resolve();
      await advance();
    };

    harness.type("first");
    const firstFlush = harness.startFlush();
    await advance();

    // The first write is in flight, which is the only window in which a second
    // flush can overlap it. A keystroke before this one would be coalesced.
    expect(written).toStrictEqual(["first"]);

    harness.type("second");
    const secondFlush = harness.startFlush();
    await advance();

    // The second flush waits on the first rather than racing it, so the fake
    // is still holding one write.
    expect(written).toStrictEqual(["first"]);

    await land(0);

    expect(written).toStrictEqual(["first", "second"]);

    await land(1);

    await expect(firstFlush).resolves.toBe(true);
    await expect(secondFlush).resolves.toBe(true);
    expect(harness.status).toBe("saved");

    harness.unmount();
  });

  it("should write again after a write fails", async () => {
    const written: string[] = [];
    let failNext = true;
    const harness = mountAutosave((_path, content) => {
      written.push(content);

      if (failNext) {
        failNext = false;

        return Promise.reject(new Error("the disk said no"));
      }

      return Promise.resolve(new Date(1));
    });

    harness.type("hello");
    await harness.settle();

    expect(written).toStrictEqual(["hello"]);
    expect(harness.status).toBe("failed");

    // The failed write handed its content back, and the chain still runs.
    await expect(harness.flush()).resolves.toBe(true);
    expect(written).toStrictEqual(["hello", "hello"]);
    expect(harness.status).toBe("saved");

    harness.unmount();
  });

  it("should report the buffer unsafe to quit when its write fails", async () => {
    const harness = mountAutosave(() =>
      Promise.reject(new Error("the disk said no"))
    );

    harness.type("hello");

    // This false is what cancels a quit, unlike the one a gone file reports.
    await expect(harness.flush()).resolves.toBe(false);
    expect(harness.status).toBe("failed");

    harness.unmount();
  });
});
