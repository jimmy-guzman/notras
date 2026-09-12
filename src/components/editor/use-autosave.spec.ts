import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotePersistence } from "@/components/editor/note-persistence";
import { useAutosave } from "./use-autosave";

const AUTOSAVE_DELAY_MS = 800;

function mountAutosave(
  write: (path: string, content: string) => Promise<Date>
) {
  const initialProps: { enabled: boolean; duringCommit?: () => void } = {
    enabled: true,
  };
  const { result, rerender } = renderHook(
    ({
      enabled,
      duringCommit,
    }: {
      enabled: boolean;
      duringCommit?: () => void;
    }) => {
      const [persistence] = useState(() =>
        createNotePersistence(
          {
            content: "",
            kind: "note",
            path: "note.md",
            revision: "r0",
            updatedAt: new Date(0),
          },
          {
            changePath: () =>
              Promise.reject(new Error("no path action requested")),
            onPathChanged: () => undefined,
            write: async (path, content) => ({
              path,
              revision: content,
              updatedAt: await write(path, content),
            }),
          }
        )
      );
      useLayoutEffect(() => {
        persistence.receiveFile(
          "note.md",
          { content: "", revision: "r0", updatedAt: new Date(0) },
          !enabled
        );
        duringCommit?.();
      }, [duringCommit, enabled, persistence]);
      return useAutosave(persistence);
    },
    { initialProps }
  );

  return {
    async flush() {
      let landed = false;
      await act(async () => {
        landed = await result.current.flush();
      });
      return landed;
    },
    get reason() {
      return result.current.reason;
    },
    setEnabled(enabled: boolean) {
      rerender({ enabled });
    },
    async setEnabledMidCommit(enabled: boolean) {
      // A layout effect lets the timer fire before passive effects, even though renderHook flushes both.
      rerender({
        duringCommit: () => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS),
        enabled,
      });
      await Promise.resolve();
    },
    async settle() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      });
    },
    startFlush() {
      return result.current.flush();
    },
    get status() {
      return result.current.status;
    },
    type(content: string) {
      act(() => result.current.onChange({ content, mode: "body" }));
    },
  };
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
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
  });

  it("should say why the write failed while it is failed", async () => {
    let failNext = true;
    const harness = mountAutosave(() => {
      if (failNext) {
        failNext = false;

        return Promise.reject(new Error("the disk is full"));
      }

      return Promise.resolve(new Date(1));
    });

    harness.type("hello");
    await harness.settle();

    expect(harness.status).toBe("failed");
    expect(harness.reason).toBe("the disk is full");

    await expect(harness.flush()).resolves.toBe(true);
    expect(harness.reason).toBeUndefined();
  });

  it("should report the buffer unsafe to quit when its write fails", async () => {
    const harness = mountAutosave(() =>
      Promise.reject(new Error("the disk said no"))
    );

    harness.type("hello");

    // This false is what cancels a quit, unlike the one a gone file reports.
    await expect(harness.flush()).resolves.toBe(false);
    expect(harness.status).toBe("failed");
  });
});
