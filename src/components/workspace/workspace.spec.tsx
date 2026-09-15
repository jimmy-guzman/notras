import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";

import { Layout } from "@/layout";
import { closeTab, getTabState } from "@/lib/tabs/store";

function limitsToOne(filters: unknown): filters is { limit: 1 } {
  return (
    typeof filters === "object" &&
    filters !== null &&
    "limit" in filters &&
    filters.limit === 1
  );
}

const NEW_NOTE = /new note/u;

describe("workspace", () => {
  it("should let a new note open before library queries finish without a late restore replacing it", async () => {
    localStorage.removeItem("tabs");
    mockWindows("main");
    const recent = Promise.withResolvers<unknown[]>();
    const listed = Promise.withResolvers<[]>();
    const tags = Promise.withResolvers<[]>();
    mockIPC(async (command, args) => {
      if (command === "get_notes_dir") {
        return "/notes";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes") {
        if (args === undefined || !("filters" in args)) {
          throw new Error("list_notes requires filters");
        }
        return limitsToOne(args.filters)
          ? await recent.promise
          : await listed.promise;
      }
      if (command === "list_tags") {
        return await tags.promise;
      }
      if (command === "create_note") {
        return { path: "chosen.md", updatedAt: 1, warnings: [] };
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
    onTestFinished(async () => {
      act(() => {
        recent.resolve([]);
        listed.resolve([]);
        tags.resolve([]);
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
    const user = userEvent.setup();
    await screen.findByText("loading recent note...");
    const buttons = await screen.findAllByRole("button", { name: NEW_NOTE });
    const [button] = buttons;
    if (button === undefined) {
      throw new Error("new note action did not render");
    }
    await user.click(button);
    await screen.findByText("Available document");
    expect(
      await screen.findByRole("tab", { name: "Chosen" })
    ).toBeInTheDocument();
    act(() => {
      recent.resolve([
        {
          createdAt: 1,
          folder: "",
          path: "older.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "Older",
          updatedAt: 1,
        },
      ]);
    });
    await waitFor(() => {
      expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual([
        "chosen.md",
      ]);
    });
    expect(screen.getByText("Available document")).toBeInTheDocument();
  });
});
