import { execFile } from "node:child_process";
import {
  appendFile,
  chmod,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { cleanupWdioSession, startWdioSession } from "@wdio/tauri-service";
import { describe, expect, inject, it } from "vitest";

// oxlint-disable-next-line typescript/strict-void-return -- Node supplies a custom promisify implementation
const exec = promisify(execFile);

async function processIdOf(binary: string) {
  const { stdout } = await exec("pgrep", ["-f", binary]);

  return Number(stdout.trim().split("\n")[0]);
}

function isRunning(processId: number) {
  try {
    process.kill(processId, 0);

    return true;
  } catch {
    return false;
  }
}

/** Sends the quit AppKit delivers from the Dock and at logout, as `terminate:`. */
async function askMacOSToQuit(processId: number) {
  await exec("osascript", [
    "-l",
    "JavaScript",
    "-e",
    'ObjC.import("AppKit"); function run(argv) { return $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0])).terminate; }',
    String(processId),
  ]);
}

/** Posts ⌘Q, which reaches `terminate:` through the focused webview and the menu. */
async function pressCommandQ(processId: number) {
  await exec("osascript", [
    "-l",
    "JavaScript",
    "-e",
    'ObjC.import("CoreGraphics"); function run(argv) { for (const down of [true, false]) { const event = $.CGEventCreateKeyboardEvent(null, 12, down); $.CGEventSetFlags(event, $.kCGEventFlagMaskCommand); $.CGEventPostToPid(Number(argv[0]), event); } }',
    String(processId),
  ]);
}

describe("native smoke", () => {
  it("should save an edit to disk and display it after restarting the app", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const marker = `saved-${Date.now()}`;

    const launch = async () =>
      await startWdioSession({
        browserName: "tauri",
        "tauri:options": { application: binary },
        "wdio:tauriServiceOptions": {
          captureBackendLogs: true,
          captureFrontendLogs: true,
          driverProvider: "embedded",
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
        "Opening the seeded note from home"
      );
      // Launch lands on home; the seeded note is its one recent row.
      const row = first.$('[aria-label="recent notes"] button');
      await row.waitForDisplayed({ timeout: 30_000 });
      await row.click();
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
      } catch (screenshotError) {
        await appendFile(
          path.join(artifacts, "failure.txt"),
          `\nScreenshot failed: ${String(screenshotError)}`
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
      } catch (screenshotError) {
        await appendFile(
          path.join(artifacts, "failure.txt"),
          `\nScreenshot failed: ${String(screenshotError)}`
        );
      }

      throw error;
    } finally {
      await cleanupWdioSession(second);
    }
  });

  it("should save an edit and a jot when macOS asks the app to quit", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const marker = `quit-${Date.now()}`;
    const jot = `jot-${Date.now()}`;

    const session = await startWdioSession({
      browserName: "tauri",
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        captureBackendLogs: true,
        captureFrontendLogs: true,
        driverProvider: "embedded",
        logDir: artifacts,
        startTimeout: 30_000,
      },
    });

    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Writing a jot, then an edit the autosave has not reached"
      );
      // The first test left the seeded note open, and this launch restores it.
      const editor = session.$('[contenteditable="true"]');
      await editor.waitForDisplayed({ timeout: 30_000 });
      const main = await session.getWindowHandle();
      await session.execute(async () => {
        await window.__TAURI__?.core?.invoke?.("show_capture");
      });
      await expect
        .poll(
          async () => {
            const handles = await session.getWindowHandles();

            return handles.length;
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(1);

      const handles = await session.getWindowHandles();

      await session.switchToWindow(
        handles.find((handle) => handle !== main) ?? main
      );

      const capture = session.$('[contenteditable="true"]');

      await capture.waitForDisplayed({ timeout: 15_000 });
      await capture.addValue(jot);
      await session.switchToWindow(main);
      // The embedded driver's action keys do not edit contenteditable elements.
      await session.execute(() => {
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

      const processId = await processIdOf(binary);
      await askMacOSToQuit(processId);

      await expect
        .poll(() => isRunning(processId), { timeout: 15_000 })
        .toBe(false);

      const saved = await readFile(note, "utf-8");

      expect(saved).toContain(marker);

      const library = path.dirname(note);
      const notes = await readdir(library);

      const bodies = await Promise.all(
        notes
          .filter((name) => name.endsWith(".md"))
          .map(
            async (name) => await readFile(path.join(library, name), "utf-8")
          )
      );

      expect(bodies.join("\n")).toContain(jot);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `Quit through macOS: ${String(error)}`
      );

      throw error;
    } finally {
      await cleanupWdioSession(session);
    }
  });

  it("should save a jot when ⌘Q ends the app", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const jot = `command-q-${Date.now()}`;
    const library = path.dirname(note);

    const session = await startWdioSession({
      browserName: "tauri",
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        captureBackendLogs: true,
        captureFrontendLogs: true,
        driverProvider: "embedded",
        logDir: artifacts,
        startTimeout: 30_000,
      },
    });

    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Pressing ⌘Q on a jot"
      );
      // The first test left the seeded note open, and this launch restores it.
      await session
        .$('[contenteditable="true"]')
        .waitForDisplayed({ timeout: 30_000 });
      const main = await session.getWindowHandle();
      await session.execute(async () => {
        await window.__TAURI__?.core?.invoke?.("show_capture");
      });
      await expect
        .poll(
          async () => {
            const handles = await session.getWindowHandles();

            return handles.length;
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(1);

      const handles = await session.getWindowHandles();

      await session.switchToWindow(
        handles.find((handle) => handle !== main) ?? main
      );

      const capture = session.$('[contenteditable="true"]');

      await capture.waitForDisplayed({ timeout: 15_000 });
      await capture.addValue(jot);

      const processId = await processIdOf(binary);
      await pressCommandQ(processId);

      await expect
        .poll(() => isRunning(processId), { timeout: 15_000 })
        .toBe(false);

      const notes = await readdir(library);

      const bodies = await Promise.all(
        notes
          .filter((name) => name.endsWith(".md"))
          .map(
            async (name) => await readFile(path.join(library, name), "utf-8")
          )
      );

      expect(bodies.join("\n")).toContain(jot);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `⌘Q: ${String(error)}`
      );

      throw error;
    } finally {
      await cleanupWdioSession(session);
    }
  });

  it("should stay open when a quit cannot save, and quit once it can", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const jot = `refused-${Date.now()}`;
    const library = path.dirname(note);

    const session = await startWdioSession({
      browserName: "tauri",
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        captureBackendLogs: true,
        captureFrontendLogs: true,
        driverProvider: "embedded",
        logDir: artifacts,
        startTimeout: 30_000,
      },
    });

    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Quitting with a jot the library refuses"
      );
      // The first test left the seeded note open, and this launch restores it.
      await session
        .$('[contenteditable="true"]')
        .waitForDisplayed({ timeout: 30_000 });
      const main = await session.getWindowHandle();
      await session.execute(async () => {
        await window.__TAURI__?.core?.invoke?.("show_capture");
      });
      await expect
        .poll(
          async () => {
            const handles = await session.getWindowHandles();

            return handles.length;
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(1);

      const handles = await session.getWindowHandles();

      await session.switchToWindow(
        handles.find((handle) => handle !== main) ?? main
      );

      const capture = session.$('[contenteditable="true"]');

      await capture.waitForDisplayed({ timeout: 15_000 });
      await capture.addValue(jot);

      const processId = await processIdOf(binary);
      await chmod(library, 0o555);
      await askMacOSToQuit(processId);

      // Past the five second backstop, which a refused quit must not reach.
      await sleep(7000);
      expect(isRunning(processId)).toBeTruthy();
      expect(await capture.getText()).toContain(jot);

      await chmod(library, 0o755);
      await askMacOSToQuit(processId);

      await expect
        .poll(() => isRunning(processId), { timeout: 15_000 })
        .toBe(false);

      const notes = await readdir(library);

      const bodies = await Promise.all(
        notes
          .filter((name) => name.endsWith(".md"))
          .map(
            async (name) => await readFile(path.join(library, name), "utf-8")
          )
      );

      expect(bodies.join("\n")).toContain(jot);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `Refused quit: ${String(error)}`
      );

      throw error;
    } finally {
      await chmod(library, 0o755);
      await cleanupWdioSession(session);
    }
  });

  it("should show a hidden window whose edit a quit cannot save", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const marker = `hidden-${Date.now()}`;
    const library = path.dirname(note);

    const session = await startWdioSession({
      browserName: "tauri",
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        captureBackendLogs: true,
        captureFrontendLogs: true,
        driverProvider: "embedded",
        logDir: artifacts,
        startTimeout: 30_000,
      },
    });

    const mainIsVisible = async () =>
      await session.execute(
        async () =>
          await window.__TAURI__?.core?.invoke?.("plugin:window|is_visible", {
            label: "main",
          })
      );

    try {
      await writeFile(
        path.join(artifacts, "stage.txt"),
        "Quitting with an unsaved edit in a hidden window"
      );
      // The first test left the seeded note open, and this launch restores it.
      const editor = session.$('[contenteditable="true"]');
      await editor.waitForDisplayed({ timeout: 30_000 });
      // The embedded driver's action keys do not edit contenteditable elements.
      await session.execute(() => {
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
      await chmod(library, 0o555);
      await editor.addValue(` ${marker}`);
      await session.execute(async () => {
        await window.__TAURI__?.core?.invoke?.("plugin:window|hide", {
          label: "main",
        });
      });
      await expect.poll(mainIsVisible, { timeout: 5000 }).toBe(false);

      const processId = await processIdOf(binary);
      await askMacOSToQuit(processId);

      await expect.poll(mainIsVisible, { timeout: 10_000 }).toBe(true);
      expect(isRunning(processId)).toBeTruthy();

      await chmod(library, 0o755);
      await askMacOSToQuit(processId);

      await expect
        .poll(() => isRunning(processId), { timeout: 15_000 })
        .toBe(false);

      const saved = await readFile(note, "utf-8");

      expect(saved).toContain(marker);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `Hidden window: ${String(error)}`
      );

      throw error;
    } finally {
      await chmod(library, 0o755);
      await cleanupWdioSession(session);
    }
  });

  it("should end a quit a frozen window never answers", async () => {
    const { artifacts, binary } = inject("smoke");

    const session = await startWdioSession({
      browserName: "tauri",
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        captureBackendLogs: true,
        captureFrontendLogs: true,
        driverProvider: "embedded",
        logDir: artifacts,
        startTimeout: 30_000,
      },
    });

    try {
      // The first test left the seeded note open, and this launch restores it.
      await session
        .$('[contenteditable="true"]')
        .waitForDisplayed({ timeout: 30_000 });
      const processId = await processIdOf(binary);
      await session.execute(() => {
        // Late enough that the driver hears back before the page stops.
        setTimeout(() => {
          for (;;) {
            // Never yields, so the window cannot answer the quit.
          }
        }, 500);
      });
      await sleep(1500);
      await askMacOSToQuit(processId);

      await expect
        .poll(() => isRunning(processId), { timeout: 15_000 })
        .toBe(false);
    } catch (error) {
      await writeFile(
        path.join(artifacts, "failure.txt"),
        `Frozen window: ${String(error)}`
      );

      throw error;
    } finally {
      await cleanupWdioSession(session);
    }
  });
});
