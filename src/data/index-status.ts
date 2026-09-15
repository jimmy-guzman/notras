import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";
import type { IndexStatus } from "@/server/adapters/bindings";

export async function getIndexStatus(): Promise<IndexStatus> {
  return await nativeCommand(async () => await commands.indexStatus());
}

export const indexStatusQuery = queryOptions({
  meta: { what: "could not refresh the index status" },
  queryFn: getIndexStatus,
  queryKey: ["index-status"] as const,
});

export async function applyIndexStatus(
  client: QueryClient,
  status: IndexStatus
) {
  await client.cancelQueries({ queryKey: indexStatusQuery.queryKey });
  client.setQueryData(indexStatusQuery.queryKey, status);
}
