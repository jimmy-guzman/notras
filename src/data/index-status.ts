import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { commands } from "@/server/adapters/bindings";
import type { IndexStatus } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export const indexStatusQuery = queryOptions({
  meta: { what: "could not refresh the index status" },
  queryFn: async () =>
    await nativeCommand(async () => await commands.indexStatus()),
  queryKey: ["index-status"] as const,
});

export async function applyIndexStatus(
  client: QueryClient,
  status: IndexStatus
) {
  await client.cancelQueries({ queryKey: indexStatusQuery.queryKey });
  client.setQueryData(indexStatusQuery.queryKey, status);
}
