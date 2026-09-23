import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNotePersistence } from "@/components/editor/note-persistence";
import { FileError } from "@/core/errors";

import { useAutosave } from "./use-autosave";

const AUTOSAVE_DELAY_MS = 800;

function mountAutosave(
  write: (path: string, content: string) => Promise<Date>
) {
  let onDisk = true;
  const persistence = createNotePersistence(
    {
      content: "",
      path: "note.md",
      revision: "r0",
      updatedAt: new Date(0),
    },
    {
      changePath: () => {
        throw new Error("no path action requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (!onDisk) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return { content: "", revision: "r0", updatedAt: new Date(0) };
      },
      stash: async () => {},
      write: async (path, content) => ({
        kind: "committed",
        receipt: {
          path,
          revision: content,
          updatedAt: await write(path, content),
        },
      }),
    }
  );
  const { result } = renderHook(() => useAutosave(persistence));

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
    async setOnDisk(present: boolean) {
      onDisk = present;
      await act(async () => {
        await persistence.refresh();
      });
    },
    async settle() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      });
    },
    async startFlush() {
      return await result.current.flush();
    },
    get status() {
      return result.current.status;
    },
    type(content: string) {
      act(() => {
        result.current.onChange({ content, mode: "body" });
      });
    },
  };
}

/** Run every chain link that can run, without landing a write. */
async function advance() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe(useAutosave, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("should write the buffer once the debounce elapses", async () => {
    const written: string[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      return new Date(1);
    });

    harness.type("hello");
    await harness.settle();

    expect(written).toStrictEqual(["hello"]);
    expect(harness.status).toBe("saved");
  });

  it("should not write while the file is missing", async () => {
    const written: string[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      return new Date(1);
    });

    await harness.setOnDisk(false);
    harness.type("typed while the file was gone");
    await harness.settle();

    expect(written).toStrictEqual([]);
  });

  it("should report the buffer safe to quit while holding text it cannot write", async () => {
    const written: string[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      return new Date(1);
    });

    await harness.setOnDisk(false);
    harness.type("the file is gone but this is on screen");

    // A false here cancels the quit, which would leave the app unquittable
    // while the tab is open, so the buffer is abandoned rather than blocking.
    await expect(harness.flush()).resolves.toBeTruthy();
    expect(written).toStrictEqual([]);
  });

  it("should not write once a read found the file missing while the debounce was pending", async () => {
    const written: string[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      return new Date(1);
    });

    harness.type("about to be deleted");
    await harness.setOnDisk(false);
    await harness.settle();

    expect(written).toStrictEqual([]);
  });

  it("should write what is on screen once the file is back", async () => {
    const written: string[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      return new Date(1);
    });

    harness.type("first");
    await harness.settle();

    await harness.setOnDisk(false);
    harness.type("first, plus everything typed while the file was gone");
    await harness.setOnDisk(true);
    await harness.flush();

    expect(written).toStrictEqual([
      "first",
      "first, plus everything typed while the file was gone",
    ]);
  });

  it("should land overlapping writes in the order they were flushed", async () => {
    const written: string[] = [];
    const landWrite: (() => void)[] = [];
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      const { promise, resolve } = Promise.withResolvers<Date>();
      landWrite.push(() => {
        resolve(new Date(1));
      });
      return await promise;
    });

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

    await expect(firstFlush).resolves.toBeTruthy();
    await expect(secondFlush).resolves.toBeTruthy();
    expect(harness.status).toBe("saved");
  });

  it("should write again after a write fails", async () => {
    const written: string[] = [];
    let failNext = true;
    const harness = mountAutosave(async (_path, content) => {
      written.push(content);

      if (failNext) {
        failNext = false;

        throw new Error("the disk said no");
      }

      return new Date(1);
    });

    harness.type("hello");
    await harness.settle();

    expect(written).toStrictEqual(["hello"]);
    expect(harness.status).toBe("failed");

    // The failed write handed its content back, and the chain still runs.
    await expect(harness.flush()).resolves.toBeTruthy();
    expect(written).toStrictEqual(["hello", "hello"]);
    expect(harness.status).toBe("saved");
  });

  it("should say why the write failed while it is failed", async () => {
    let failNext = true;
    const harness = mountAutosave(async () => {
      if (failNext) {
        failNext = false;

        throw new Error("The disk is full");
      }

      return new Date(1);
    });

    harness.type("hello");
    await harness.settle();

    expect(harness.status).toBe("failed");
    expect(harness.reason).toBe("The disk is full");

    await expect(harness.flush()).resolves.toBeTruthy();
    expect(harness.reason).toBeUndefined();
  });

  it("should report the buffer unsafe to quit when its write fails", async () => {
    const harness = mountAutosave(() => {
      throw new Error("the disk said no");
    });

    harness.type("hello");

    // This false is what cancels a quit, unlike the one a gone file reports.
    await expect(harness.flush()).resolves.toBeFalsy();
    expect(harness.status).toBe("failed");
  });
});
