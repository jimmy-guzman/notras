import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cleanupWdioSession, startWdioSession } from "@wdio/tauri-service";
import { describe, expect, inject, it } from "vitest";

describe("native smoke", () => {
  it("should save an edit to disk and display it after restarting the app", async () => {
    const { artifacts, binary, dataStore, note } = inject("smoke");
    const marker = `saved-${Date.now()}`;
    const launch = async () =>
      await startWdioSession({
        browserName: "tauri",
        "tauri:options": { application: binary },
        "wdio:tauriServiceOptions": {
          captureBackendLogs: true,
          captureFrontendLogs: true,
          driverProvider: "embedded",
          env: { NOTRAS_SMOKE_DATA_STORE: dataStore },
          logDir: artifacts,
          startTimeout: 30_000,
        },
      });
    await writeFile(
      path.join(artifacts, "stage.txt"),
      "Launching the first process"
    );
    const first = await launch();
    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Editing and waiting for persistence"
      );
      const editor = first.$('[contenteditable="true"]');
      await editor.waitForDisplayed({ timeout: 30_000 });
      await expect
        .poll(async () => await editor.getText(), { timeout: 15_000 })
        .toContain("Original body.");
      // The embedded driver's action keys do not edit contenteditable elements.
      await first.execute(() => {
        const surface = document.querySelector('[contenteditable="true"]');
        const selection = window.getSelection();
        if (!(surface instanceof HTMLElement) || !selection) {
          throw new Error("The note editor has no editable selection.");
        }
        surface.focus();
        const range = document.createRange();
        range.selectNodeContents(surface);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await editor.addValue(` ${marker}`);
      await expect
        .poll(async () => await readFile(note, "utf-8"), { timeout: 15_000 })
        .toContain(`Original body. ${marker}`);
      expect(await readFile(note, "utf-8")).toContain("# Smoke note");
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `First launch or persistence: ${String(error)}`
      );
      try {
        await first.saveScreenshot(path.join(artifacts, "failure.png"));
        await first.tauri.execute(async ({ core }) => {
          await core.invoke("plugin:webview|clear_all_browsing_data", {
            label: "main",
          });
        });
      } catch (diagnosticError) {
        await appendFile(
          path.join(artifacts, "failure.txt"),
          `\nScreenshot or storage cleanup failed: ${String(diagnosticError)}`
        );
      }
      throw error;
    } finally {
      await cleanupWdioSession(first);
    }

    await writeFile(
      path.join(artifacts, "stage.txt"),
      "Launching a new process after stopping the first"
    );
    const second = await launch();
    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Reading the saved note after restart"
      );
      const editor = second.$('[contenteditable="true"]');
      await editor.waitForDisplayed({ timeout: 30_000 });
      await expect
        .poll(async () => await editor.getText(), { timeout: 15_000 })
        .toContain(`Original body. ${marker}`);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `After restart: ${String(error)}`
      );
      try {
        await second.saveScreenshot(path.join(artifacts, "failure.png"));
      } catch (diagnosticError) {
        await appendFile(
          path.join(artifacts, "failure.txt"),
          `\nScreenshot failed: ${String(diagnosticError)}`
        );
      }
      throw error;
    } finally {
      try {
        await second.tauri.execute(async ({ core }) => {
          await core.invoke("plugin:webview|clear_all_browsing_data", {
            label: "main",
          });
        });
      } finally {
        await cleanupWdioSession(second);
      }
    }
  });
});
