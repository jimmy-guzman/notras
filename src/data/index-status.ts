import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { nativeCommand } from "@/data/native-command";
import { commands, type IndexStatus } from "@/server/adapters/bindings";

export async function getIndexStatus(): Promise<IndexStatus> {
  return await nativeCommand(commands.indexStatus);
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
