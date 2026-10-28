import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";

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

  it("should save the appearance the user picks", async () => {
    // happy-dom does not report macOS, and the setting exists only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const saved: unknown[] = [];
    let stored = "auto";
    mockIPC((command, payload) => {
      if (command === "get_appearance") {
        return stored;
      }

      if (command === "set_appearance") {
        saved.push(payload);
        stored = "dark";

        return null;
      }

      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    onTestFinished(() => {
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <SettingsDialog notesDir="/notes" onOpenChange={() => {}} open />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "dark" }));

    expect(saved).toStrictEqual([{ appearance: "dark" }]);
    expect(screen.getByRole("button", { name: "dark" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("should keep the saved appearance when a change cannot be saved", async () => {
    // happy-dom does not report macOS, and the setting exists only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC((command) => {
      if (command === "get_appearance") {
        return "light";
      }

      if (command === "set_appearance") {
        throw Object.assign(new Error("The appearance could not be saved"), {
          kind: "failed",
        });
      }

      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    onTestFinished(() => {
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

    await user.click(await screen.findByRole("button", { name: "dark" }));

    expect(
      await screen.findByText("could not change appearance")
    ).toBeInTheDocument();
    expect(
      screen.getByText("The appearance could not be saved")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "light" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("should show the last saved pick when an earlier one fails", async () => {
    // happy-dom does not report macOS, and the setting exists only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const darkSave = Promise.withResolvers<null>();
    let saved = "auto";
    mockIPC(async (command, payload) => {
      if (command === "get_appearance") {
        return saved;
      }

      if (command === "set_appearance") {
        if (
          JSON.stringify(payload) === JSON.stringify({ appearance: "dark" })
        ) {
          return await darkSave.promise;
        }

        saved = "light";

        return null;
      }

      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    onTestFinished(() => {
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

    await user.click(await screen.findByRole("button", { name: "dark" }));
    await user.click(screen.getByRole("button", { name: "light" }));
    darkSave.reject(
      Object.assign(new Error("The appearance could not be saved"), {
        kind: "failed",
      })
    );

    expect(
      await screen.findByText("could not change appearance")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(saved).toBe("light");
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "light" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
  });

  it("should keep a later pick on screen while an earlier one fails", async () => {
    // happy-dom does not report macOS, and the setting exists only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const darkSave = Promise.withResolvers<null>();
    const lightSave = Promise.withResolvers<null>();
    const calls: unknown[] = [];
    mockIPC(async (command, payload) => {
      if (command === "get_appearance") {
        return "auto";
      }

      if (command === "set_appearance") {
        calls.push(payload);

        if (
          JSON.stringify(payload) === JSON.stringify({ appearance: "dark" })
        ) {
          return await darkSave.promise;
        }

        return await lightSave.promise;
      }

      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    onTestFinished(() => {
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

    await user.click(await screen.findByRole("button", { name: "dark" }));
    await user.click(screen.getByRole("button", { name: "light" }));
    darkSave.reject(
      Object.assign(new Error("The appearance could not be saved"), {
        kind: "failed",
      })
    );

    await waitFor(() => {
      expect(calls).toStrictEqual([
        { appearance: "dark" },
        { appearance: "light" },
      ]);
    });
    expect(screen.getByRole("button", { name: "light" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    lightSave.resolve(null);
  });

  it("should offer no appearance away from macOS", () => {
    mockIPC((command) => {
      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    onTestFinished(() => {
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <SettingsDialog notesDir="/notes" onOpenChange={() => {}} open />
      </QueryClientProvider>
    );

    expect(screen.getByText("launch at login")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "appearance" })
    ).not.toBeInTheDocument();
  });
});
