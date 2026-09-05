import { error as logError } from "@tauri-apps/plugin-log";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";

import { run } from "./run";

// The log goes to Rust through a command, which does not exist here.
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn() }));

describe("run", () => {
  it("should rethrow a typed failure as itself", async () => {
    const failure = new FileError({
      kind: "failed",
      message: "permission denied",
    });

    await expect(run(Effect.fail(failure))).rejects.toBe(failure);
  });

  it("should keep a defect's cause out of the message and in the log", async () => {
    await expect(run(Effect.die("a bug"))).rejects.toThrow(
      "an unexpected error"
    );
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("a bug"));
  });
});
