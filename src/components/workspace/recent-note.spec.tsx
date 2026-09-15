import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen } from "@testing-library/react";
import { expect, it, onTestFinished } from "vitest";
import { indexStatusQuery } from "@/data/index-status";
import { Layout } from "@/layout";
import { closeTab, getTabState } from "@/lib/tabs/store";

it("should say indexing while the recent note waits on the first scan", async () => {
  localStorage.removeItem("tabs");
  mockWindows("main");
  const recent = Promise.withResolvers<unknown[]>();
  mockIPC((command) => {
    if (command === "get_notes_dir") {
      return "/notes";
    }
    if (command === "index_status") {
      return { state: "scanning" };
    }
    if (command === "list_notes") {
      return recent.promise;
    }
    if (command === "list_tags") {
      return [];
    }
    if (command === "take_pending_open" || command === "find_mentions") {
      return [];
    }
    if (command.startsWith("plugin:")) {
      return 0;
    }
    throw new Error(`unexpected command: ${command}`);
  });
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  onTestFinished(async () => {
    await act(() => {
      recent.resolve([]);
    });
    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }
    client.clear();
    clearMocks();
    localStorage.removeItem("tabs");
  });
  render(
    <QueryClientProvider client={client}>
      <Layout />
    </QueryClientProvider>
  );

  await screen.findByText("indexing notes...");
  expect(screen.queryByText("loading recent note...")).not.toBeInTheDocument();
  await act(() => {
    client.setQueryData(indexStatusQuery.queryKey, { state: "ready" });
  });
  await screen.findByText("loading recent note...");
});
