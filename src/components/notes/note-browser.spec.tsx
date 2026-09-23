import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nullable, object, parse, string } from "valibot";
import { describe, expect, it, onTestFinished } from "vitest";

import { noteQueries } from "@/data/queries";
import { Layout } from "@/layout";
import { rememberNote } from "@/lib/recent-notes";
import { closeTab, getTabState } from "@/lib/tabs/store";
import { closeNoteBrowser } from "@/lib/ui/note-browser";
import type { NoteMeta } from "@/server/adapters/bindings";

function mount(
  list: (query: string | null) => NoteMeta[] | Promise<NoteMeta[]>,
  folders?: () => string[]
) {
  localStorage.clear();
  closeNoteBrowser();
  mockWindows("main");
  mockIPC(async (command, args) => {
    if (command === "get_notes_dir") {
      return "/notes";
    }
    if (command === "index_status") {
      return { state: "ready" };
    }
    if (command === "list_notes") {
      const { filters } = parse(
        object({ filters: object({ query: nullable(string()) }) }),
        args
      );
      return await list(filters.query);
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
      [
        "list_tags",
        "take_pending_open",
        "pending_open_files",
        "find_mentions",
      ].includes(command)
    ) {
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
  const view = render(
    <QueryClientProvider client={client}>
      <Layout />
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
  it("should list an empty folder without a count", async () => {
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
      () => ["inbox", "work"]
    );
    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );

    expect(
      await browser.findByRole("button", { name: /^inbox$/u })
    ).toBeInTheDocument();
    expect(
      browser.getByRole("button", { name: /^work 1$/u })
    ).toBeInTheDocument();
  });

  it("should show all notes and say so when the chosen folder is deleted", async () => {
    let folders = ["inbox", "work"];
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
      () => folders
    );
    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );
    await user.click(await browser.findByRole("button", { name: /^inbox$/u }));
    expect(
      browser.getByRole("button", { name: "choose collection: inbox" })
    ).toBeInTheDocument();

    folders = ["work"];
    await act(async () => {
      await user.client.invalidateQueries({ queryKey: noteQueries.index });
    });

    expect(
      await browser.findByText("inbox was deleted, showing all notes")
    ).toBeInTheDocument();
    expect(
      browser.getByRole("button", { name: "choose collection: all notes" })
    ).toBeInTheDocument();
    expect(browser.getByText("One")).toBeInTheDocument();
  });

  it("should retain browser focus and query while opening notes, then return focus to the editor on close", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: "First preview",
        tags: [],
        title: "One",
        updatedAt: 2,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: "Second preview",
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
    ]);
    await screen.findByRole("heading", { name: "Opened" });
    await user.click(screen.getByRole("button", { name: "browse notes" }));
    const browser = await screen.findByRole("complementary", {
      name: "browse notes",
    });
    const input = within(browser).getByRole("textbox", {
      name: "search all notes",
    });
    expect(input).toHaveFocus();
    await user.type(input, "preview");
    await waitFor(() =>
      expect(
        within(browser).getByRole("list", { name: "notes in all notes" })
      ).toHaveAttribute("aria-busy", "false")
    );
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    const row = within(browser).getByRole("button", {
      name: /^Two Second preview/u,
    });
    await waitFor(() => expect(row).toHaveAttribute("aria-current", "page"));
    await screen.findByRole("heading", { name: "Opened" });
    expect(row).toHaveFocus();
    expect(input).toHaveValue("preview");
    expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual(["two.md"]);
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: "browse notes" })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveClass("ProseMirror")
    );
    await user.click(screen.getByRole("button", { name: "browse notes" }));
    expect(
      screen.getByRole("textbox", { name: "search all notes" })
    ).toHaveValue("preview");
    expect(localStorage.getItem("note-browser-open")).toBe("true");
  });

  it("should browse descendants, pinned notes and tags while preserving the query when changing collection", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work/deep",
        path: "work/deep/one.md",
        pinned: true,
        snippet: "Plan one",
        tags: ["project"],
        title: "One",
        updatedAt: 2,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: "Plan two",
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
    await user.type(browser.getByRole("textbox"), "Plan");
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );
    await user.click(await browser.findByRole("button", { name: /^work 1$/u }));
    expect(browser.getByRole("textbox", { name: "search work" })).toHaveValue(
      "Plan"
    );
    expect(
      within(browser.getByRole("list", { name: "notes in work" })).queryByText(
        "Two"
      )
    ).not.toBeInTheDocument();
    expect(await browser.findByText("One")).toBeInTheDocument();
    await user.click(
      browser.getByRole("button", { name: "choose collection: work" })
    );
    await user.click(browser.getByRole("button", { name: /^project 1$/u }));
    expect(
      browser.getByRole("textbox", { name: "search #project" })
    ).toHaveValue("Plan");
    await user.click(
      browser.getByRole("button", { name: "choose collection: #project" })
    );
    await user.click(browser.getByRole("button", { name: /^pinned 1$/u }));
    expect(
      within(
        browser.getByRole("list", { name: "notes in pinned" })
      ).getAllByRole("button")
    ).toHaveLength(1);
    await user.click(
      browser.getByRole("button", { name: "choose collection: pinned" })
    );
    await user.click(browser.getByRole("button", { name: /^all notes 2$/u }));
    expect(browser.getByRole("textbox")).toHaveValue("Plan");
    expect(await browser.findByText("Two")).toBeInTheDocument();
  });

  it("should keep similarly named root folders separate from nested folders", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "plan/deep",
        path: "plan/deep/one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 2,
      },
      {
        createdAt: 0,
        folder: "plans",
        path: "plans/two.md",
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
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );
    expect(
      await browser.findAllByRole("button", { name: "plans 1" })
    ).toHaveLength(1);
    expect(browser.getByRole("button", { name: "deep 1" })).toBeVisible();
    await user.click(browser.getByLabelText("subfolders in plan"));
    expect(
      browser.getByRole("button", { hidden: true, name: "deep 1" })
    ).not.toBeVisible();
    expect(browser.getByRole("button", { name: "plans 1" })).toBeVisible();
  });

  it("should skip descendants of collapsed folders during arrow navigation and return from collections with Escape", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "work/deep/deeper",
        path: "work/deep/deeper/one.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "One",
        updatedAt: 2,
      },
      {
        createdAt: 0,
        folder: "z",
        path: "z/two.md",
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
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );
    await user.click(browser.getByLabelText("subfolders in work"));
    await user.tab({ shift: true });
    expect(browser.getByRole("button", { name: "work 1" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(browser.getByRole("button", { name: "z 1" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(
      browser.getByRole("textbox", { name: "search all notes" })
    ).toHaveFocus();
    expect(
      browser.getByRole("list", { name: "notes in all notes" })
    ).toBeVisible();
  });

  it("should preserve the visit order snapshot and open a modified click in another tab", async () => {
    const user = mount(() => [
      {
        createdAt: 0,
        folder: "",
        path: "one.md",
        pinned: false,
        snippet: "First preview",
        tags: [],
        title: "One",
        updatedAt: 2,
      },
      {
        createdAt: 0,
        folder: "",
        path: "two.md",
        pinned: false,
        snippet: "Second preview",
        tags: [],
        title: "Two",
        updatedAt: 1,
      },
    ]);
    await screen.findByRole("heading", { name: "Opened" });
    rememberNote("/notes", "one.md");
    rememberNote("/notes", "two.md");
    await user.click(screen.getByRole("button", { name: "browse notes" }));
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await user.click(
      browser.getByRole("button", { name: "choose collection: all notes" })
    );
    await user.click(browser.getByRole("button", { name: "recent 2" }));
    const list = within(browser.getByRole("list", { name: "notes in recent" }));
    await waitFor(() => {
      expect(list.getAllByRole("button")).toHaveLength(2);
    });
    expect(list.getAllByRole("button")[0]).toHaveTextContent("Two");
    await user.keyboard("{Control>}");
    await user.click(
      list.getByRole("button", { name: /^Two Second preview/u })
    );
    await user.keyboard("{/Control}");
    await waitFor(() => {
      expect(getTabState().tabs).toHaveLength(2);
    });
    expect(browser.getByRole("textbox")).toBeVisible();
    await user.keyboard("{End}");
    expect(
      list.getByRole("button", { name: /^One First preview/u })
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(list.getAllByRole("button")[0]).toHaveTextContent("Two");
    await user.keyboard("{Home}");
    expect(
      list.getByRole("button", { name: /^Two Second preview/u })
    ).toHaveFocus();
  });

  it("should retain an empty result while another search is pending and replace it with completed results", async () => {
    const pending = Promise.withResolvers<NoteMeta[]>();
    const requested: string[] = [];
    const note: NoteMeta = {
      createdAt: 0,
      folder: "",
      path: "one.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "One",
      updatedAt: 1,
    };
    const user = mount(async (query) => {
      if (query === "missing more") {
        requested.push(query);
        return await pending.promise;
      }
      return query !== null && query !== "" ? [] : [note];
    });
    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await user.type(browser.getByRole("textbox"), "missing");
    const empty = await browser.findByText("nothing found");
    expect(empty).toBeVisible();
    expect(
      browser.queryByRole("button", { name: /create/u })
    ).not.toBeInTheDocument();
    await user.type(browser.getByRole("textbox"), " more");
    expect(empty).toBeVisible();
    await waitFor(() => {
      expect(requested).toContain("missing more");
    });
    expect(empty).toBeVisible();
    expect(
      browser.getByRole("status", { name: "note count" })
    ).toHaveTextContent("0");
    await act(async () => {
      pending.resolve([note]);
    });
    expect(await browser.findByText("One")).toBeVisible();
    expect(browser.queryByText("nothing found")).not.toBeInTheDocument();
    await user.click(browser.getByRole("button", { name: "clear search" }));
    expect(browser.getByRole("textbox")).toHaveFocus();
    expect(await browser.findByText("One")).toBeVisible();
  });

  it("should retain rows without a searching message until an empty search completes", async () => {
    const pending = Promise.withResolvers<NoteMeta[]>();
    const user = mount(async (query) =>
      query === "missing"
        ? await pending.promise
        : [
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
          ]
    );
    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await browser.findByText("One");
    const count = browser.getByRole("status", { name: "note count" });
    expect(count).toHaveTextContent("1");
    await user.type(browser.getByRole("textbox"), "missing");
    expect(count).toHaveTextContent("1");
    expect(
      browser.getByRole("list", { name: "notes in all notes" })
    ).toHaveAttribute("aria-busy", "true");
    expect(
      browser.getByRole("button", { name: /^One Preview/u })
    ).toHaveAttribute("aria-disabled", "true");
    expect(browser.queryByText("searching...")).not.toBeInTheDocument();
    expect(browser.queryByText("nothing found")).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve([]);
    });
    expect(await browser.findByText("nothing found")).toBeVisible();
    expect(browser.queryByText("One")).not.toBeInTheDocument();
    expect(count).toHaveTextContent("0");
  });

  it("should keep pending rows inert and show a failed search with retry instead of creation", async () => {
    const pending = Promise.withResolvers<NoteMeta[]>();
    const requested: string[] = [];
    const user = mount(async (query) => {
      if (query === "missing" && requested.length === 0) {
        requested.push(query);
        return await pending.promise;
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
    });
    await user.click(
      await screen.findByRole("button", { name: "browse notes" })
    );
    const browser = within(
      await screen.findByRole("complementary", { name: "browse notes" })
    );
    await browser.findByText("One");
    await user.type(browser.getByRole("textbox"), "missing");
    const row = browser.getByRole("button", { name: /^One Preview/u });
    expect(row).toHaveAttribute("aria-disabled", "true");
    const before = getTabState();
    await user.click(row);
    expect(getTabState()).toBe(before);
    await waitFor(() => {
      expect(requested).toContain("missing");
    });
    await act(async () => {
      pending.reject({ kind: "failed", message: "Search unavailable" });
    });
    expect(await browser.findByRole("alert")).toHaveTextContent(
      "Search unavailable"
    );
    expect(browser.getByRole("button", { name: "retry" })).toBeInTheDocument();
    expect(browser.queryByText("nothing found")).not.toBeInTheDocument();
    expect(
      browser.queryByRole("button", { name: /create/u })
    ).not.toBeInTheDocument();
    await user.click(browser.getByRole("button", { name: "retry" }));
    expect(await browser.findByText("One")).toBeVisible();
    expect(browser.queryByRole("alert")).not.toBeInTheDocument();
  });
});
