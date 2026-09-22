import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import type { NoteMeta } from "@/core/notes";
import {
  forgetNote,
  lastChosenNote,
  readRecentNotes,
  recentNotes,
  rememberNote,
  renameRecentNote,
} from "@/lib/recent-notes";

describe("recent notes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should report a storage failure and preserve the last saved history", async () => {
    rememberNote("/notes", "kept.md");
    render(createElement(Toaster));
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    onTestFinished(() => {
      write.mockRestore();
    });
    expect(() => {
      rememberNote("/notes", "new.md");
    }).not.toThrow();
    expect(readRecentNotes("/notes")).toStrictEqual(["kept.md"]);
    expect(
      await screen.findByText("could not update recent notes")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });

  it.each([false, true])(
    "should return empty history after a read failure when logging fails: %s",
    async (loggingFails) => {
      const logged: unknown[] = [];
      mockIPC((command, args) => {
        logged.push({ args, command });
        if (loggingFails) {
          throw new Error("Log is unavailable");
        }
      });
      const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
        throw new DOMException("Storage access is denied", "SecurityError");
      });
      onTestFinished(() => {
        read.mockRestore();
        clearMocks();
      });

      expect(readRecentNotes("/notes")).toStrictEqual([]);
      await waitFor(() => {
        expect(logged).toMatchObject([
          {
            args: {
              message: "could not read recent notes: Storage access is denied",
            },
            command: "plugin:log|log",
          },
        ]);
      });
    }
  );

  it.each(["null", "{}", "bad json", "[3]", '["a.md","a.md"]'])(
    "should discard invalid history %s",
    (raw) => {
      localStorage.setItem("recent-notes:/notes", raw);
      expect(readRecentNotes("/notes")).toStrictEqual([]);
    }
  );

  it("should put pins first, then last chosen, then unvisited by last saved and path", () => {
    const notes: NoteMeta[] = [
      {
        createdAt: new Date(0),
        folder: "",
        path: "old-pin.md",
        pinned: true,
        snippet: null,
        tags: [],
        title: "Old pin",
        updatedAt: new Date(0),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "read-pin.md",
        pinned: true,
        snippet: null,
        tags: [],
        title: "Read pin",
        updatedAt: new Date(0),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "frequent.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Frequent",
        updatedAt: new Date(900),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "chosen.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Chosen",
        updatedAt: new Date(0),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "b.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "B",
        updatedAt: new Date(1000),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "a.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "A",
        updatedAt: new Date(1000),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "old.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Old",
        updatedAt: new Date(0),
      },
    ];
    rememberNote("/notes", "read-pin.md");
    rememberNote("/notes", "frequent.md");
    rememberNote("/notes", "frequent.md");
    rememberNote("/notes", "chosen.md");
    rememberNote("/notes", "missing.md");
    expect(recentNotes("/notes", notes).map((note) => note.path)).toStrictEqual(
      [
        "read-pin.md",
        "old-pin.md",
        "chosen.md",
        "frequent.md",
        "a.md",
        "b.md",
        "old.md",
      ]
    );
    expect(lastChosenNote("/notes", notes)?.path).toBe("chosen.md");
    expect(lastChosenNote("/elsewhere", notes)?.path).toBe("a.md");
    expect(lastChosenNote("/notes", [])).toBeUndefined();
  });

  it("should carry renames and moves without a visit and remove deleted history only from its library", () => {
    rememberNote("/notes", "a.md");
    rememberNote("/notes", "b.md");
    rememberNote("/other", "a.md");
    renameRecentNote("/notes", "a.md", "renamed.md");
    renameRecentNote("/notes", "renamed.md", "folder/renamed.md");
    renameRecentNote("/notes", "unvisited.md", "elsewhere.md");
    expect(readRecentNotes("/notes")).toStrictEqual([
      "b.md",
      "folder/renamed.md",
    ]);
    expect(readRecentNotes("/other")).toStrictEqual(["a.md"]);
    forgetNote("/notes", "b.md");
    expect(readRecentNotes("/notes")).toStrictEqual(["folder/renamed.md"]);
    expect(
      JSON.parse(localStorage.getItem("recent-notes:/notes") ?? "null")
    ).toStrictEqual(["folder/renamed.md"]);
  });
});
