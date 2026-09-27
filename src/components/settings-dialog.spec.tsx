import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { registerPendingFlush } from "@/lib/pending-flush";

import { SettingsDialog } from "./settings-dialog";

describe(SettingsDialog, () => {
  it("should keep the notes folder when an open note cannot be saved", async () => {
    const calls: string[] = [];
    mockIPC((command) => {
      calls.push(command);
      if (command === "plugin:dialog|open") {
        return "/new";
      }
      if (command.startsWith("plugin:")) {
        return 0;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const unregister = registerPendingFlush(async () => false);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    onTestFinished(() => {
      unregister();
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <Toaster />
        <SettingsDialog notesDir="/notes" onOpenChange={() => {}} open />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "change..." }));

    expect(
      await screen.findByText("could not update notes folder")
    ).toBeInTheDocument();
    expect(
      screen.getByText("An open note could not be saved")
    ).toBeInTheDocument();
    expect(calls).not.toContain("set_notes_dir");
  });
});
