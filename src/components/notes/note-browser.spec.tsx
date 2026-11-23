import { QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nullish, object, parse, string } from "valibot";
import { describe, expect, it, onTestFinished } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { noteQueries } from "@/data/queries";
import { Layout } from "@/layout";
import { createQueryClient } from "@/lib/query-client";
import { rememberNote } from "@/lib/recent-notes";
import { closeTab, getTabState, openNote } from "@/lib/tabs/store";
import { closeNoteBrowser, showNoteBrowserMode } from "@/lib/ui/note-browser";
import type { NoteMeta_Serialize } from "@/server/adapters/bindings";

type NoteMeta = Omit<NoteMeta_Serialize, "createdAt" | "updatedAt"> & {
  createdAt: number;
  updatedAt: number;
};

function mount(
  list: (query: string | null) => NoteMeta[] | Promise<NoteMeta[]>,
  folders?: () => string[]
) {
  localStorage.clear();
  showNoteBrowserMode("folders");
  closeNoteBrowser();
  mockWindows("main");
  mockIPC(async (command, args) => {
    if (command === "get_notes_dir") {
      return "/notes";
    }

    if (command === "index_status") {
      return { state: "ready" };
    }

    if (command === "get_theme") {
      return "inki";
    }

    if (command === "list_notes") {
      const { filters } = parse(
        object({ filters: object({ query: nullish(string()) }) }),
        args
      );

      return await list(filters.query ?? null);
    }

    if (command === "list_folders") {
      if (folders !== undefined) {
        return folders();
      }

      // A disk holding these notes holds their folders and every ancestor.
      const notes = await list(null);

      return [
        ...new Set(
          notes.flatMap(({ folder }) =>
            folder
              .split("/")
              .filter((part) => part !== "")
              .map((_, index, parts) => parts.slice(0, index + 1).join("/"))
          )
        ),
      ];
    }

    if (command === "read_note") {
      return {
        content: "# Opened\n\nDocument body",
        revision: "r1",
        updatedAt: 1,
      };
    }

    if (command === "read_conflict") {
      return null;
    }

    if (
      ["list_tags", "take_pending_open", "pending_open_files"].includes(command)
    ) {
      return [];
    }

    if (command.startsWith("plugin:")) {
      return 0;
    }

    throw new Error(`unexpected command: ${command}`);
  });

  const client = createQueryClient();

  const view = render(
    <QueryClientProvider client={client}>
      <Layout />
      <Toaster />
    </QueryClientProvider>
  );

  onTestFinished(() => {
    view.unmount();
    closeNoteBrowser();

    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }

    client.clear();
    clearMocks();
    localStorage.clear();
  });

  return Object.assign(userEvent.setup(), { client });
}

describe("note browser", () => {
  it("should toggle the browser from its button, which rides in the browser's band while open, with no tab open", async () => {
    const user = mount(() => []);

    await user.click(
      await screen.findByRole("button", {
        name: "browse notes",
        pressed: false,
      })
    );
    expect(
      await screen.findByRole("complementary", { name: "browse notes" })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "browse notes", pressed: true })
    );
    expect(
      screen.queryByRole("complementary", { name: "browse notes" })
    ).not.toBeInTheDocument();
  });

  it("should fold a folder open to its subfolders and notes, with root notes below the folders and no count on an empty folder", async () => {
    const user = mount(
      () => [
        {
          createdAt: 0,
          folder: "work",
          path: "work/one.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "One",
          updatedAt: 1,
        },
        {
          createdAt: 0,
          folder: "work/deep",
          path: "work/deep/two.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "Two",
          updatedAt: 1,
        },
        {
          createdAt: 0,
          folder: "",
          path: "three.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "Three",
          updatedAt: 1,
        },
      ],
      () => ["inbox", "work", "work/deep"]
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    const work = await browser.findByRole("button", { name: /^work 2$/u });

    expect(work).toHaveAttribute("aria-expanded", "false");
    expect(browser.getByRole("button", { name: /^inbox$/u })).toBeVisible();
    expect(browser.getByRole("button", { name: "Three" })).toBeVisible();
    expect(
      browser.queryByRole("button", { name: "One" })
    ).not.toBeInTheDocument();

    await user.click(work);

    expect(work).toHaveAttribute("aria-expanded", "true");
    expect(browser.getByRole("button", { name: "One" })).toBeVisible();
    expect(
      browser.queryByRole("button", { name: "Two" })
    ).not.toBeInTheDocument();

    await user.click(browser.getByRole("button", { name: /^deep 1$/u }));

    expect(browser.getByRole("button", { name: "Two" })).toBeVisible();

    await user.click(work);

    expect(
      browser.queryByRole("button", { name: "One" })
    ).not.toBeInTheDocument();
  });

  it("should sort the notes in a folder by title, with pinned notes first", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work",
        path: "work/pear.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Pear",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "work",
        path: "work/apple.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Apple",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "work",
        path: "work/zebra.md",
        pinned: true,
        snippet: null,
        tags: [],
        title: "Zebra",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await user.click(await browser.findByRole("button", { name: /^work 3$/u }));

    expect(
      browser.getAllByRole("button").map((row) => row.textContent)
    ).toStrictEqual(["work3", "Zebra", "Apple", "Pear"]);
  });

  it("should keep similarly named root folders separate from nested folders", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work",
        path: "work/one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "archive/work",
        path: "archive/work/two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await user.click(await browser.findByRole("button", { name: /^work 1$/u }));

    expect(browser.getByRole("button", { name: "One" })).toBeVisible();
    expect(
      browser.queryByRole("button", { name: "Two" })
    ).not.toBeInTheDocument();
  });

  it("should open the tree on the folder of the note that shows and focus its row", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work/deep",
        path: "work/deep/two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "three.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Three",
        updatedAt: 1,
      },
    ]);

    act(() => {
      openNote("work/deep/two.md");
    });
    await screen.findByRole("heading", { name: "Opened" });
    await user.click(screen.getByRole("button", { name: "browse notes" }));

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    const row = await browser.findByRole("button", { name: "Two" });

    expect(row).toHaveAttribute("aria-current", "page");
    expect(row).toHaveFocus();
  });

  it("should open the tree on the folder of a note opened while the browser was closed", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work/deep",
        path: "work/deep/two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "three.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Three",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    await within(
      await screen.findByRole("complementary", { name: "browse notes" })
    ).findByRole("button", { name: "Three" });
    act(() => {
      closeNoteBrowser();
    });
    act(() => {
      openNote("work/deep/two.md");
    });
    await screen.findByRole("heading", { name: "Opened" });
    await user.click(screen.getByRole("button", { name: "browse notes" }));

    const row = await within(
      await screen.findByRole("complementary", { name: "browse notes" })
    ).findByRole("button", { name: "Two" });

    expect(row).toHaveAttribute("aria-current", "page");
    expect(row).toHaveFocus();
  });

  it("should fold a tag apart from a folder of the same name", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "#idea",
        path: "#idea/one.md",
        pinned: false,
        snippet: null,
        tags: ["idea"],
        title: "One",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByRole("button", { name: /^#idea 1$/u });
    await user.click(screen.getByRole("button", { name: "browse tags" }));
    await user.click(browser.getByRole("button", { name: /^idea 1$/u }));
    await user.click(screen.getByRole("button", { name: "browse folders" }));

    expect(
      await browser.findByRole("button", { name: /^#idea 1$/u })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("should fold a tag open to the notes that carry it and remember the mode", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: null,
        tags: ["draft", "idea"],
        title: "One",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: null,
        tags: ["idea"],
        title: "Two",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByRole("button", { name: "One" });
    await user.click(screen.getByRole("button", { name: "browse tags" }));

    const tags = within(browser.getByRole("list", { name: "tags" }));

    expect(tags.getByRole("button", { name: /^draft 1$/u })).toBeVisible();
    expect(tags.queryByRole("button", { name: "One" })).not.toBeInTheDocument();

    await user.click(tags.getByRole("button", { name: /^idea 2$/u }));

    expect(tags.getByRole("button", { name: "One" })).toBeVisible();
    expect(tags.getByRole("button", { name: "Two" })).toBeVisible();
    expect(localStorage.getItem("note-browser-mode")).toBe('"tags"');
  });

  it("should list recent notes in visit order, keep that order while a row opens, and open a modified click in another tab", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "three.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Three",
        updatedAt: 1,
      },
    ]);

    act(() => {
      openNote("one.md");
    });
    await screen.findByRole("heading", { name: "Opened" });
    rememberNote("/notes", "one.md");
    rememberNote("/notes", "two.md");
    await user.click(screen.getByRole("button", { name: "browse notes" }));
    await user.click(
      await screen.findByRole("button", { name: "browse recent" })
    );

    const list = within(
      await screen.findByRole("list", { name: "recent notes" })
    );

    expect(
      list.getAllByRole("button").map((row) => row.textContent)
    ).toStrictEqual(["Two", "One"]);

    await user.keyboard("{Control>}");
    await user.click(list.getByRole("button", { name: "Two" }));
    await user.keyboard("{/Control}");
    await waitFor(() => {
      expect(getTabState().tabs).toHaveLength(2);
    });
    await user.keyboard("{End}");
    expect(list.getByRole("button", { name: "One" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      list.getAllByRole("button").map((row) => row.textContent)
    ).toStrictEqual(["Two", "One"]);
    await user.keyboard("{Home}");
    expect(list.getByRole("button", { name: "Two" })).toHaveFocus();
  });

  it("should list only the pinned notes, and say so when nothing is pinned", async () => {
    let pinned = true;

    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work",
        path: "work/one.md",
        pinned,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await user.click(screen.getByRole("button", { name: "browse pinned" }));

    const list = within(
      await browser.findByRole("list", { name: "pinned notes" })
    );

    expect(
      list.getAllByRole("button").map((row) => row.textContent)
    ).toStrictEqual(["One"]);

    pinned = false;
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });

    expect(await browser.findByText("nothing pinned")).toBeInTheDocument();
  });

  it("should open the browser on a mode from its shortcut", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: null,
        tags: ["idea"],
        title: "One",
        updatedAt: 1,
      },
    ]);

    await screen.findByRole("button", { name: "browse notes" });
    await user.keyboard("{Control>}{Alt>}2{/Alt}{/Control}");

    expect(
      await screen.findByRole("button", { name: /^idea 1$/u })
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "browse tags", pressed: true })
    ).toBeInTheDocument();
  });

  it("should open the browser on a mode from the palette", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: null,
        tags: ["idea"],
        title: "One",
        updatedAt: 1,
      },
    ]);

    await screen.findByRole("button", { name: "browse notes" });
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    await user.click(
      await screen.findByRole("option", { name: /^browse tags/u })
    );

    expect(
      await screen.findByRole("button", { name: /^idea 1$/u })
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "browse tags", pressed: true })
    ).toBeInTheDocument();
  });

  it("should close the palette from the search button that opened it", async () => {
    const user = mount(() => []);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    await user.click(screen.getByRole("button", { name: "find a note" }));
    await screen.findByRole("dialog");
    // The palette hides the rest of the window from assistive tech, but the bar
    // above its backdrop still takes a pointer.
    await user.click(
      screen.getByRole("button", { hidden: true, name: "find a note" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("should keep the mode when its lit icon is clicked", async () => {
    const user = mount(() => []);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    await screen.findByText("no notes yet");
    await user.click(
      screen.getByRole("button", { name: "browse folders", pressed: true })
    );

    expect(
      screen.getByRole("button", { name: "browse folders", pressed: true })
    ).toBeInTheDocument();
    expect(screen.getByText("no notes yet")).toBeInTheDocument();
  });

  it("should move through the rows with the arrow keys, fold with left and right, and return focus to the editor on Escape", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work",
        path: "work/one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
    ]);

    act(() => {
      openNote("two.md");
    });
    await screen.findByRole("heading", { name: "Opened" });
    await user.click(screen.getByRole("button", { name: "browse notes" }));

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    const work = await browser.findByRole("button", { name: /^work 1$/u });

    await waitFor(() => {
      expect(browser.getByRole("button", { name: "Two" })).toHaveFocus();
    });
    await user.keyboard("{ArrowUp}");
    expect(work).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(browser.getByRole("button", { name: "One" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(browser.getByRole("button", { name: "One" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    });
    expect(browser.getByRole("button", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(
      browser.queryByRole("button", { name: "One" })
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: "browse notes" })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toHaveClass("ProseMirror");
    });
    expect(localStorage.getItem("note-browser-open")).toBe("false");
  });

  it("should move focus from a row in a folder to the folder with left", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work",
        path: "work/one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    const work = await browser.findByRole("button", { name: /^work 1$/u });

    await waitFor(() => {
      expect(work).toHaveFocus();
    });
    await user.keyboard("{ArrowRight}{ArrowDown}{ArrowLeft}");

    expect(work).toHaveFocus();
    expect(work).toHaveAttribute("aria-expanded", "true");
  });

  it("should show a note whose folder the folder list is missing", async () => {
    const user = mount(
      () => [
        {
          createdAt: 0,
          folder: "work",
          path: "work/one.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "One",
          updatedAt: 1,
        },
      ],
      () => []
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await user.click(await browser.findByRole("button", { name: /^work 1$/u }));

    expect(browser.getByRole("button", { name: "One" })).toBeVisible();
  });

  it("should keep the focus in the browser when a refresh removes the focused row", async () => {
    let pinned = true;

    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
    ]);

    await screen.findByRole("button", { name: "browse notes" });
    await user.keyboard("{Control>}{Alt>}4{/Alt}{/Control}");

    const browser = await screen.findByRole("complementary", {
      name: "browse notes",
    });

    await waitFor(() => {
      expect(
        within(browser).getByRole("button", { name: "One" })
      ).toHaveFocus();
    });
    pinned = false;
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });
    await within(browser).findByText("nothing pinned");

    await waitFor(() => {
      expect(browser.contains(document.activeElement)).toBeTruthy();
    });
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: "browse notes" })
    ).not.toBeInTheDocument();
  });

  it("should focus the first row that arrives after the browser opened empty", async () => {
    let notes: NoteMeta[] = [];

    const user = mount(() => notes);

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByText("no notes yet");
    notes = [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 1,
      },
    ];
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });

    await waitFor(() => {
      expect(browser.getByRole("button", { name: "One" })).toHaveFocus();
    });
  });

  it("should keep the listed notes and toast the reason when a refresh fails", async () => {
    let failing = false;

    const user = mount(
      () => {
        if (failing) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [
          {
            createdAt: 0,
            folder: "",
            path: "one.md",
            pinned: false,
            snippet: "Preview",
            tags: [],
            title: "One",
            updatedAt: 1,
          },
        ];
      },
      () => []
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByText("One");
    failing = true;
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });

    expect(
      await screen.findByText("could not refresh the note list")
    ).toBeInTheDocument();
    expect(screen.getAllByText("could not refresh the note list")).toHaveLength(
      1
    );
    expect(screen.getByText("the disk is busy")).toBeInTheDocument();
    expect(browser.getByText("One")).toBeVisible();
    expect(browser.queryByText("could not load notes")).not.toBeInTheDocument();
  });

  it("should read every failed note list again from the toast's retry", async () => {
    let failing = false;
    let reads = 0;

    const user = mount(
      () => {
        reads += 1;

        if (failing) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [
          {
            createdAt: 0,
            folder: "",
            path: "one.md",
            pinned: false,
            snippet: "Preview",
            tags: [],
            title: "One",
            updatedAt: 1,
          },
        ];
      },
      () => []
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByText("One");
    failing = true;
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });
    await screen.findByText("could not refresh the note list");
    failing = false;
    const before = reads;

    await user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(
        user.client
          .getQueryCache()
          .findAll({ predicate: (query) => query.state.status === "error" })
      ).toStrictEqual([]);
    });
    expect(reads - before).toBe(1);
    expect(browser.getByText("One")).toBeVisible();
  });

  it("should keep the empty panel when a refresh fails", async () => {
    let failing = false;

    const user = mount(
      () => {
        if (failing) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [];
      },
      () => []
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    await browser.findByText("no notes yet");
    failing = true;
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });

    expect(
      await screen.findByText("could not refresh the note list")
    ).toBeInTheDocument();
    expect(browser.getByText("no notes yet")).toBeInTheDocument();
    expect(browser.queryByText("could not load notes")).not.toBeInTheDocument();
  });

  it("should say why the notes could not load and read them again on retry", async () => {
    let failing = true;

    const user = mount(
      () => [
        {
          createdAt: 0,
          folder: "work",
          path: "work/one.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "One",
          updatedAt: 1,
        },
      ],
      () => {
        if (failing) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return ["work"];
      }
    );

    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );

    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );

    expect(await browser.findByRole("alert")).toHaveTextContent(
      "the disk is busy"
    );

    failing = false;
    await user.click(browser.getByRole("button", { name: "retry" }));

    expect(
      await browser.findByRole("button", { name: /^work 1$/u })
    ).toBeInTheDocument();
    expect(browser.queryByRole("alert")).not.toBeInTheDocument();
  });
});
