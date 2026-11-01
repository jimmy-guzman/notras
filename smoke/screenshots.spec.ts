import { execFile } from "node:child_process";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { cleanupWdioSession, startWdioSession } from "@wdio/tauri-service";
import { describe, expect, inject, it } from "vitest";

// oxlint-disable-next-line typescript/strict-void-return -- Node supplies a custom promisify implementation for execFile's ChildProcess return.
const exec = promisify(execFile);

type Browser = Awaited<ReturnType<typeof startWdioSession>>;

interface Modifiers {
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/** Fires a shortcut at the document, past any focused input, the way the hotkey manager sees a real one. */
async function press(
  browser: Browser,
  key: string,
  code: string,
  modifiers: Modifiers
) {
  await browser.execute(
    (eventKey, eventCode, held) => {
      for (const type of ["keydown", "keyup"]) {
        document.dispatchEvent(
          new KeyboardEvent(type, {
            altKey: held.alt === true,
            bubbles: true,
            cancelable: true,
            code: eventCode,
            key: eventKey,
            metaKey: held.meta === true,
            shiftKey: held.shift === true,
          })
        );
      }
    },
    key,
    code,
    modifiers
  );
}

/** Clicks the browser row whose title leads its text, since a snippet can name another note; ⌘ opens it in a new tab. */
async function openRow(browser: Browser, title: string, inNewTab: boolean) {
  await browser
    .$('[aria-label^="notes in"] button')
    .waitForDisplayed({ timeout: 30_000 });

  await browser.execute(
    (text, meta) => {
      const list = document.querySelector('[aria-label^="notes in"]');

      const button = [...(list?.querySelectorAll("button") ?? [])].find(
        (candidate) => candidate.textContent?.startsWith(text)
      );

      if (button === undefined) {
        throw new Error(`No row titled ${text} in the browser.`);
      }

      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          metaKey: meta,
        })
      );
    },
    title,
    inNewTab
  );
}

/** The pid of the app the session launched, found by its per-run binary path. */
async function processId(binary: string) {
  const { stdout } = await exec("pgrep", ["-f", binary]);

  return Number(stdout.trim().split("\n")[0]);
}

/** Brings the app to the front so the traffic lights draw in colour; the session leaves it behind whatever was in front. */
async function activate(pid: number) {
  const script = `
    ObjC.import("AppKit");
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid});
    app.activateWithOptions($.NSApplicationActivateIgnoringOtherApps);
  `;

  await exec("osascript", ["-l", "JavaScript", "-e", script]);
}

/** Clicks the palette action with this name, which reaches what the harness has no shortcut for. */
async function runAction(browser: Browser, name: string) {
  await press(browser, "P", "KeyP", { meta: true, shift: true });
  await browser
    .$('[placeholder="run an action..."]')
    .waitForDisplayed({ timeout: 10_000 });

  await browser.execute((text) => {
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (candidate) => candidate.textContent?.startsWith(text)
    );

    if (option === undefined) {
      throw new Error(`No action named ${text} in the palette.`);
    }

    option.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }, name);
}

/** The window server's number for the app's window with this title, read without Accessibility. */
async function windowNumber(pid: number, title: string) {
  const script = `
    ObjC.import("CoreGraphics");
    const ref = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0);
    const windows = ObjC.deepUnwrap(ObjC.castRefToObject(ref));
    const own = windows.find((w) => w.kCGWindowOwnerPID === ${pid} && w.kCGWindowName === ${JSON.stringify(title)});
    own === undefined ? "" : String(own.kCGWindowNumber);
  `;

  const { stdout } = await exec("osascript", [
    "-l",
    "JavaScript",
    "-e",
    script,
  ]);

  const number = Number(stdout.trim());

  if (stdout.trim() === "" || !Number.isInteger(number)) {
    throw new Error(
      `No window titled ${title} on screen for pid ${pid}. Titles come back empty until the terminal has Screen Recording.`
    );
  }

  return number;
}

/** Captures the native window, corners transparent and no shadow, into assets/. */
async function capture(browser: Browser, window: number, name: string) {
  // Lets the surface it just opened finish its transition.
  await browser.pause(500);
  await exec("screencapture", [
    "-o",
    "-x",
    "-l",
    String(window),
    path.resolve("assets", `${name}.png`),
  ]);
}

describe("README screenshots", () => {
  it("should capture home, the editor, the browser, the graph, the note panel, the palette, the review and quick capture", async () => {
    const { artifacts, binary, note } = inject("smoke");
    const library = path.dirname(note);

    await rm(note);
    await cp(path.resolve("smoke/library"), library, { recursive: true });

    const browser = await startWdioSession({
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
      await browser
        .$('[aria-label="recent notes"] button')
        .waitForDisplayed({ timeout: 30_000 });
      const pid = await processId(binary);
      await activate(pid);
      const window = await windowNumber(pid, "notras");

      // A first launch opens with the browser showing.
      await openRow(browser, "Pour-over", false);
      await openRow(browser, "Saturday ride", true);
      await openRow(browser, "Watch list", true);
      await press(browser, "1", "Digit1", { meta: true });
      await press(browser, "\\", "Backslash", { meta: true });
      await browser
        .$('[aria-label="diagram"]')
        .waitForDisplayed({ timeout: 30_000 });
      await browser.$(".syntax-token").waitForDisplayed({ timeout: 30_000 });
      // Takes the caret off the heading, since a blink lands in the frame.
      await browser.execute(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await capture(browser, window, "editor");

      await press(browser, "\\", "Backslash", { meta: true });
      await browser
        .$('[aria-label^="notes in"] button')
        .waitForDisplayed({ timeout: 10_000 });
      await capture(browser, window, "browser");
      await press(browser, "\\", "Backslash", { meta: true });

      await press(browser, "g", "KeyG", { alt: true, meta: true });
      await browser
        .$('[aria-current="true"][aria-label="Pour-over"]')
        .waitForDisplayed({ timeout: 10_000 });
      await capture(browser, window, "graph");
      await press(browser, "g", "KeyG", { alt: true, meta: true });

      await press(browser, "L", "KeyL", { meta: true, shift: true });
      await browser
        .$('[aria-label="note panel: mentions"] li button')
        .waitForDisplayed({ timeout: 10_000 });
      await browser.execute(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await capture(browser, window, "panel");
      await press(browser, "\\", "Backslash", { meta: true, shift: true });

      await press(browser, "P", "KeyP", { meta: true, shift: true });
      await browser
        .$('[placeholder="run an action..."]')
        .waitForDisplayed({ timeout: 10_000 });
      await capture(browser, window, "palette");
      await press(browser, "P", "KeyP", { meta: true, shift: true });

      // Three closes land on home, where the visits just made lead the recent list.
      await press(browser, "w", "KeyW", { meta: true });
      await press(browser, "w", "KeyW", { meta: true });
      await press(browser, "w", "KeyW", { meta: true });
      await browser
        .$('[aria-label="recent notes"] button')
        .waitForDisplayed({ timeout: 10_000 });
      await capture(browser, window, "home");

      await press(browser, "1", "Digit1", { meta: true });
      const editor = browser.$('[contenteditable="true"]');
      await editor.waitForDisplayed({ timeout: 10_000 });
      await expect
        .poll(async () => await editor.getText(), { timeout: 10_000 })
        .toContain("A 15g dose");
      // The embedded driver's action keys do not edit contenteditable elements.
      await browser.execute(() => {
        const paragraph = document.querySelector('[contenteditable="true"] p');
        const selection = document.getSelection();

        if (!(paragraph instanceof HTMLElement) || !selection) {
          throw new Error("The note editor has no paragraph to edit.");
        }

        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });

      const seed = await readFile(
        path.resolve("smoke/library/pour-over.md"),
        "utf-8"
      );

      await editor.addValue(" Grind at 22 clicks.");
      // Lands inside the 800 ms autosave window, so the edit is still unsaved when the file changes under it.
      await writeFile(
        path.join(library, "pour-over.md"),
        seed.replace("A 15g dose", "A 16g dose")
      );
      await browser.$("button=review").waitForDisplayed({ timeout: 10_000 });
      await browser.$("button=review").click();
      await browser
        .$('[aria-label="review overlapping edits"]')
        .waitForDisplayed({ timeout: 10_000 });
      await browser.execute(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await capture(browser, window, "review");

      await runAction(browser, "quick capture");
      await expect
        .poll(async () => await windowNumber(pid, "quick capture"), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0);
      await browser.tauri.switchWindow("capture");
      // The switch takes key status from the window, which greys its traffic lights, and
      // WebKit reports no focused element until the window is key again, so the blur waits.
      await browser.tauri.execute(
        async ({ core }) =>
          await core.invoke("plugin:window|set_focus", { label: "capture" })
      );
      await expect
        .poll(async () => await browser.execute(() => document.hasFocus()), {
          timeout: 10_000,
        })
        .toBe(true);
      await browser.execute(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await capture(
        browser,
        await windowNumber(pid, "quick capture"),
        "capture"
      );
      await browser.tauri.switchWindow("main");
    } catch (error) {
      await browser.saveScreenshot(path.join(artifacts, "failure.png"));

      throw error;
    } finally {
      await cleanupWdioSession(browser);
    }

    const files = await Promise.all(
      [
        "home",
        "editor",
        "browser",
        "graph",
        "panel",
        "palette",
        "review",
        "capture",
      ].map(async (name) => await stat(path.resolve("assets", `${name}.png`)))
    );

    for (const file of files) {
      expect(file.size).toBeGreaterThan(0);
    }
  });
});
