import { QueryClient } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { applyIndexStatus, indexStatusQuery } from "@/data/index-status";
import type { IndexStatus } from "@/server/adapters/bindings";

afterEach(clearMocks);

describe("index status cache", () => {
  it("should keep a pushed status when a slower read resolves with an older one", async () => {
    const read = Promise.withResolvers<IndexStatus>();
    mockIPC((command) => {
      if (command === "index_status") {
        return read.promise;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const reading = client.prefetchQuery(indexStatusQuery);

    await applyIndexStatus(client, { state: "ready" });
    read.resolve({ state: "scanning" });
    await reading;

    expect(client.getQueryData(indexStatusQuery.queryKey)).toEqual({
      state: "ready",
    });
    client.clear();
  });

  it("should apply a pushed status when no read is in flight", async () => {
    const client = new QueryClient();

    await applyIndexStatus(client, { reason: "disk full", state: "failed" });

    expect(client.getQueryData(indexStatusQuery.queryKey)).toEqual({
      reason: "disk full",
      state: "failed",
    });
    client.clear();
  });
});
