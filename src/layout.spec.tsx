import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, onTestFinished } from "vitest";
import { Layout } from "@/layout";
import { closeTab, getTabState } from "@/lib/tabs/store";

it("should recover the workspace after a failed restore is retried", async () => {
  localStorage.setItem(
    "tabs",
    JSON.stringify({
      activeId: "saved",
      carets: {},
      tabs: [{ id: "saved", kind: "external", path: "/notes/chosen.md" }],
    })
  );
  mockWindows("main");
  let classifications = 0;
  mockIPC((command) => {
    if (command === "classify_open_paths") {
      classifications += 1;
      if (classifications < 3) {
        throw new Error("classify failed");
      }
      return [{ kind: "note", path: "chosen.md" }];
    }
    if (command === "get_notes_dir") {
      return "/notes";
    }
    if (command === "index_status") {
      return { state: "ready" };
    }
    if (command === "list_notes" || command === "list_tags") {
      return [];
    }
    if (command === "read_conflict") {
      return null;
    }
    if (command === "read_note") {
      return {
        content: "# Chosen\n\nAvailable document",
        pinned: false,
        tags: [],
        title: "Chosen",
        updatedAt: 1,
      };
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
  onTestFinished(() => {
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
  const user = userEvent.setup();

  await screen.findByText("could not load the workspace");
  screen.getByText("classify failed");
  await user.click(screen.getByRole("button", { name: "try again" }));
  await screen.findByText("could not load the workspace");
  expect(classifications).toBe(2);
  await user.click(screen.getByRole("button", { name: "try again" }));
  await screen.findByRole("tab", { name: "Chosen" });
  expect(getTabState().tabs.map((tab) => tab.path)).toEqual(["chosen.md"]);
  expect(classifications).toBe(3);
});
