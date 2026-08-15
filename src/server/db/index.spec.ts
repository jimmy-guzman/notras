import { Effect, Exit, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const close = vi.fn();
const ensureFts = vi.fn<(client: unknown) => Promise<void>>();

vi.mock("@libsql/client", () => {
  return {
    createClient: () => {
      return { close };
    },
  };
});

vi.mock("drizzle-orm/libsql", () => {
  return {
    drizzle: () => {
      return {};
    },
  };
});

vi.mock("./fts", () => {
  return {
    ensureFts: (client: unknown) => {
      return ensureFts(client);
    },
  };
});

async function buildDatabaseLayer() {
  const { makeDatabaseLayer } = await import("./index");

  return Effect.runPromiseExit(
    Effect.scoped(Layer.build(makeDatabaseLayer({ url: "file::memory:" }))),
  );
}

describe("makeDatabaseLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should close the client when fts setup fails", async () => {
    ensureFts.mockRejectedValue(new Error("fts bootstrap exploded"));

    const exit = await buildDatabaseLayer();

    expect(Exit.isFailure(exit)).toBe(true);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it("should close the client once when the scope closes normally", async () => {
    ensureFts.mockResolvedValue(undefined);

    const exit = await buildDatabaseLayer();

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });
});
