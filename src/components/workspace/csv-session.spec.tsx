import { setTimeout as sleep } from "node:timers/promises";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { number, object, parse } from "valibot";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { closeTab, getTabState, openTab, refreshTabs } from "@/lib/tabs/store";

import { CsvSession } from "./csv-session";

const PageArgs = object({ start: number() });

const ScrollTo = object({ top: number() });

/** The read of a whole file as the host reports it: the header, then pages of four rows. */
function csvFile(rows: string[][], revision = "r1") {
  const [header = [], ...body] = rows;

  return {
    header,
    page: 4,
    pages: body.map((_, index) => index).filter((index) => index % 4 === 0),
    probe: [],
    revision,
    rows: body.length,
  };
}

interface SheetMount {
  file?: () => { revision: string; rows: number };
  read: (start: number) => Promise<string[][]> | string[][];
  rowHeight?: (index: number) => number;
  rows: number;
  scrollHeight: () => number;
}

/** A sheet of many rows, its geometry stubbed at the DOM boundary since happy-dom lays nothing out. */
async function mountSheet({
  file,
  read,
  rowHeight = () => 49,
  rows,
  scrollHeight,
}: SheetMount) {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function offsetHeight(this: HTMLElement) {
      return rowHeight(Number(this.dataset.index));
    }
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    scrollHeight
  );
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  mockIPC(async (command, args) => {
    if (command === "read_csv_if_moved") {
      const current = file?.() ?? { revision: "r1", rows };

      return {
        header: ["id"],
        page: 256,
        pages: Array.from(
          { length: Math.ceil(current.rows / 256) },
          (_, page) => page * 256
        ),
        probe: [],
        ...current,
      };
    }

    return await read(parse(PageArgs, args).start);
  });

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  openTab("csv", "/Users/me/data.csv", true);
  const id = getTabState().activeId;
  onTestFinished(() => {
    closeTab(id);
    client.clear();
    clearMocks();
  });
  render(
    <QueryClientProvider client={client}>
      <CsvSession
        active
        tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
      />
      <Toaster />
    </QueryClientProvider>
  );

  await screen.findByRole("columnheader", { name: "id" });

  const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');

  if (viewport === null) {
    throw new Error("The sheet has no viewport");
  }

  return { viewport };
}

/** Rows that alternate one line and a wrapped line and a half. */
function alternatingRowHeight(index: number) {
  return index % 2 === 0 ? 49 : 73;
}

function spacerHeight(row: HTMLElement | undefined) {
  return Number(row?.style.getPropertyValue("--spacer").replace("px", "") ?? 0);
}

function drawnSheet() {
  const spacers = [
    ...document.querySelectorAll<HTMLElement>(
      "table:not([aria-hidden]) tbody tr[aria-hidden]"
    ),
  ];

  const rows = [
    ...document.querySelectorAll<HTMLElement>(
      "table:not([aria-hidden]) tbody tr[data-index]"
    ),
  ];

  const [above] = spacers;

  return {
    above: above?.previousElementSibling === null ? spacerHeight(above) : 0,
    indexes: rows.map((row) => Number(row.dataset.index)),
    spacers: spacers.reduce((sum, row) => sum + spacerHeight(row), 0),
  };
}

/** The sheet's height as the browser would lay it out: its spacers, its drawn rows, and 100px of padding and header. */
function drawnHeight() {
  const { indexes, spacers } = drawnSheet();

  return spacers + indexes.length * 49 + 100;
}

/** The index of the drawn row that covers the top of the viewport, if one does. */
function rowAtTop(
  viewport: Element,
  rowHeight: (index: number) => number = () => 49
) {
  const { above, indexes } = drawnSheet();

  const ends = indexes.map(
    (_, at) =>
      above +
      indexes.slice(0, at + 1).reduce((sum, index) => sum + rowHeight(index), 0)
  );

  return above > viewport.scrollTop
    ? undefined
    : indexes.find((_, at) => (ends[at] ?? 0) > viewport.scrollTop);
}

function mount(rows: () => Promise<string[][]>, active = true) {
  let reads = 0;
  // happy-dom lays nothing out, and the row window draws nothing into a
  // viewport of no height, so the geometry is stubbed at the DOM boundary.
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  mockIPC(async (command, args) => {
    if (command === "read_csv_if_moved") {
      reads += 1;

      return csvFile(await rows(), `r${reads}`);
    }

    if (command === "read_csv_rows") {
      const { start } = parse(PageArgs, args);
      const [, ...body] = await rows();

      return body.slice(start, start + 4);
    }

    throw new Error(`unexpected command: ${command}`);
  });

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  openTab("csv", "/Users/me/data.csv", true);
  const id = getTabState().activeId;
  onTestFinished(() => {
    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }

    client.clear();
    clearMocks();
  });
  render(
    <QueryClientProvider client={client}>
      <CsvSession
        active={active}
        tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
      />
      <Toaster />
    </QueryClientProvider>
  );

  return { client, id };
}

describe("csv session", () => {
  it("should draw the header and read the rows near the viewport by page", async () => {
    mount(async () => [
      ["city", "count"],
      ["Lima", "12"],
      ["Quito", "7"],
      ["Bogota", "3"],
      ["Cusco", "2"],
      ["Trujillo", "1"],
    ]);

    expect(
      await screen.findByRole("columnheader", { name: "city" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "count" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("cell", { name: "Trujillo" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("should say that the file is empty when it holds no rows", async () => {
    mount(async () => []);

    expect(await screen.findByText("this file is empty")).toBeInTheDocument();
  });

  it("should draw a file that holds only a header with no failure", async () => {
    const read = vi
      .fn<() => Promise<string[][]>>()
      .mockResolvedValue([["city", "count"]]);

    mount(read);

    expect(
      await screen.findByRole("columnheader", { name: "city" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("could not read this file")
    ).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledOnce();
  });

  it("should pad a row shorter than the header with empty cells", async () => {
    mount(async () => [["city", "count"], ["Lima"]]);

    await screen.findByRole("cell", { name: "Lima" });

    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("should say that it is reading the file until the read lands", async () => {
    const { promise, resolve } = Promise.withResolvers<string[][]>();
    mount(vi.fn<() => Promise<string[][]>>().mockReturnValue(promise));

    expect(await screen.findByText("reading this file")).toBeInTheDocument();

    resolve([["city"], ["Lima"]]);

    expect(
      await screen.findByRole("columnheader", { name: "city" })
    ).toBeInTheDocument();
    expect(screen.queryByText("reading this file")).not.toBeInTheDocument();
  });

  it("should say why the file could not be read and read again on request", async () => {
    const read = vi
      .fn<() => Promise<string[][]>>()
      .mockRejectedValueOnce({ kind: "failed", message: "Permission denied" })
      .mockResolvedValue([["city"], ["Lima"]]);

    mount(read);

    expect(
      await screen.findByRole("button", { name: "try again" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Permission denied")).not.toHaveLength(0);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "try again" }));

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    // The file once more, then its first page.
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("should close the tab when the file is gone", async () => {
    const { id } = mount(
      vi
        .fn<() => Promise<string[][]>>()
        .mockRejectedValue({ kind: "not-found", message: "No such file" })
    );

    await waitFor(() => {
      expect(getTabState().tabs.some((tab) => tab.id === id)).toBeFalsy();
    });
    expect(
      screen.queryByText("could not read this file")
    ).not.toBeInTheDocument();
  });

  it("should read the file afresh for a tab reopened on a path whose last read failed", async () => {
    const read = vi
      .fn<() => Promise<string[][]>>()
      .mockResolvedValueOnce([["city"], ["Lima"]])
      .mockResolvedValueOnce([["city"], ["Lima"]])
      .mockRejectedValueOnce({ kind: "not-found", message: "No such file" })
      .mockResolvedValue([["city"], ["Quito"]]);

    const { client, id } = mount(read);

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();

    act(() => {
      refreshTabs(() => true);
    });
    await waitFor(() => {
      expect(getTabState().tabs.some((tab) => tab.id === id)).toBeFalsy();
    });

    openTab("csv", "/Users/me/data.csv", true);
    const reopened = getTabState().activeId;
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id: reopened, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("cell", { name: "Quito" })
    ).toBeInTheDocument();
    expect(getTabState().tabs.some((tab) => tab.id === reopened)).toBeTruthy();
  });

  it("should re-read a tab in the background when its refresher runs", async () => {
    let onDisk = [["city"], ["Lima"]];
    const { id } = mount(async () => onDisk, false);

    expect(
      await screen.findByRole("cell", { hidden: true, name: "Lima" })
    ).toBeInTheDocument();
    onDisk = [["city"], ["Quito"]];

    act(() => {
      refreshTabs((tab) => tab.id === id);
    });

    expect(
      await screen.findByRole("cell", { hidden: true, name: "Quito" })
    ).toBeInTheDocument();
  });

  it("should read the whole file again when a page says the file moved on", async () => {
    const reads: string[] = [];

    const page = vi
      .fn<() => Promise<string[][]>>()
      .mockRejectedValueOnce({
        kind: "failed",
        message: "The file changed since it was opened",
      })
      .mockResolvedValue([["Lima"]]);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    mockIPC(async (command) => {
      reads.push(command);

      if (command === "read_csv_if_moved") {
        return csvFile([["city"], ["Lima"]], `r${reads.length}`);
      }

      return await page();
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
        <Toaster />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(reads).toStrictEqual([
      "read_csv_if_moved",
      "read_csv_rows",
      "read_csv_if_moved",
      "read_csv_rows",
    ]);
    expect(
      screen.queryByText("could not read this file")
    ).not.toBeInTheDocument();
  });

  it("should say why a page failed and read it again on request", async () => {
    const page = vi
      .fn<() => Promise<string[][]>>()
      .mockRejectedValueOnce({ kind: "failed", message: "Input/output error" })
      .mockResolvedValue([["Lima"]]);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) =>
      command === "read_csv_if_moved"
        ? csvFile([["city"], ["Lima"]])
        : await page()
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
        <Toaster />
      </QueryClientProvider>
    );

    const retry = await screen.findByRole("button", { name: "try again" });

    expect(screen.getAllByText("Input/output error")).not.toHaveLength(0);

    await userEvent.setup().click(retry);

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
  });

  it("should keep the table when a refresh finds the file unmoved", async () => {
    const reads: unknown[] = [];

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC((command, args) => {
      if (command === "read_csv_rows") {
        return [["Lima"]];
      }

      reads.push(args);

      return reads.length === 1 ? csvFile([["city"], ["Lima"]]) : null;
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("cell", { name: "Lima" });
    act(() => {
      refreshTabs((tab) => tab.id === id);
    });

    await waitFor(() => {
      expect(reads).toStrictEqual([
        { known: null, path: "/Users/me/data.csv" },
        { known: "r1", path: "/Users/me/data.csv" },
      ]);
    });
    expect(screen.getByRole("cell", { name: "Lima" })).toBeInTheDocument();
  });

  it.each([
    {
      // Past where the height of the rows outgrows what an element can be.
      file: "a million rows",
      last: "r999999",
      rows: 1_000_000,
      scrollHeight: 33_000_100,
    },
    { file: "many pages", last: "r1999", rows: 2000, scrollHeight: 98_100 },
  ])(
    "should reach the last row of a file of $file",
    async ({ last, rows, scrollHeight }) => {
      const asked: number[] = [];

      // happy-dom lays nothing out, so the geometry of a scrolled sheet is
      // stubbed at the DOM boundary.
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
        600
      );
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
        49
      );
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
        scrollHeight
      );
      onTestFinished(() => {
        vi.restoreAllMocks();
      });
      mockIPC((command, args) => {
        if (command === "read_csv_if_moved") {
          return {
            header: ["id"],
            page: 256,
            pages: Array.from(
              { length: Math.ceil(rows / 256) },
              (_, page) => page * 256
            ),
            probe: [],
            revision: "r1",
            rows,
          };
        }

        const { start } = parse(PageArgs, args);

        asked.push(start);

        return Array.from({ length: Math.min(256, rows - start) }, (_, row) => [
          `r${start + row}`,
        ]);
      });

      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });

      openTab("csv", "/Users/me/data.csv", true);
      const id = getTabState().activeId;
      onTestFinished(() => {
        closeTab(id);
        client.clear();
        clearMocks();
      });
      render(
        <QueryClientProvider client={client}>
          <CsvSession
            active
            tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
          />
        </QueryClientProvider>
      );

      expect(
        await screen.findByRole("cell", { name: "r0" })
      ).toBeInTheDocument();

      const viewport = document.querySelector(
        '[data-slot="scroll-area-viewport"]'
      );

      if (viewport === null) {
        throw new Error("The sheet has no viewport");
      }

      viewport.scrollTop = scrollHeight - 600;
      fireEvent.scroll(viewport);

      expect(
        await screen.findByRole("cell", { name: last })
      ).toBeInTheDocument();
      expect(asked).toContain(Math.floor((rows - 1) / 256) * 256);
      expect(
        screen.queryByRole("cell", { name: "r0" })
      ).not.toBeInTheDocument();
      expect(rowAtTop(viewport)).toBeDefined();
    }
  );

  it("should read a failed page again where the sheet stands", async () => {
    const asked: number[] = [];
    let failing = true;
    const rows = 2000;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    const { viewport } = await mountSheet({
      read: async (start) => {
        asked.push(start);

        if (start === 1792 && failing) {
          failing = false;

          return await failure();
        }

        return Array.from({ length: Math.min(256, rows - start) }, (_, row) => [
          `r${start + row}`,
        ]);
      },
      rows,
      scrollHeight: () => 98_100,
    });

    viewport.scrollTop = 97_500;
    fireEvent.scroll(viewport);

    const retry = await screen.findByRole("button", { name: "try again" });

    expect(viewport.closest("[inert]")).not.toBeNull();

    const user = userEvent.setup();

    await user.tab();

    expect(retry).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("cell", { name: "r1999" })
    ).toBeInTheDocument();
    expect(asked.filter((start) => start === 1792)).toHaveLength(2);
    expect(viewport.scrollTop).toBe(97_500);
    expect(viewport.closest("[inert]")).toBeNull();
    expect(viewport).toHaveFocus();
  });

  it("should clear a page's failure once the file moves on", async () => {
    let revision = "r1";
    let failing = true;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    await mountSheet({
      file: () => ({ revision, rows: 2000 }),
      read: async (start) => {
        if (failing) {
          return await failure();
        }

        return Array.from({ length: 256 }, (_, row) => [
          `${revision} ${start + row}`,
        ]);
      },
      rows: 2000,
      scrollHeight: () => 98_100,
    });

    expect(
      await screen.findByRole("button", { name: "try again" })
    ).toBeInTheDocument();

    revision = "r2";
    failing = false;
    act(() => {
      refreshTabs(() => true);
    });

    expect(
      await screen.findByRole("cell", { name: "r2 0" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "try again" })
    ).not.toBeInTheDocument();
  });

  it("should draw the rows once the file reads again after a page and its re-read both failed", async () => {
    let failing = true;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    let pageFailed = false;

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) => {
      if (command === "read_csv_if_moved") {
        if (failing) {
          return pageFailed ? await failure() : csvFile([["city"], ["Lima"]]);
        }

        return null;
      }

      if (failing) {
        pageFailed = true;

        return await failure();
      }

      return [["Lima"]];
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("button", { name: "try again" });

    failing = false;
    act(() => {
      refreshTabs(() => true);
    });

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "try again" })
    ).not.toBeInTheDocument();
  });

  it.each([
    { after: 1_000_100, before: 1_000_000, change: "grows" },
    { after: 700_000, before: 600_000, change: "crosses the height limit" },
    { after: 600_000, before: 1_000_000, change: "shrinks under the limit" },
  ])(
    "should keep rows in the viewport when a deep file $change",
    async ({ after, before }) => {
      let rows = before;

      const { viewport } = await mountSheet({
        file: () => ({ revision: `r${rows}`, rows }),
        read: (start) =>
          Array.from({ length: 256 }, (_, row) => [
            `${rows === before ? "before" : "after"} ${start + row}`,
          ]),
        rows,
        scrollHeight: drawnHeight,
      });

      viewport.scrollTop = 20_000_000;
      fireEvent.scroll(viewport);
      await screen.findAllByRole("cell", { name: /^before [1-9]/u });

      rows = after;
      act(() => {
        refreshTabs(() => true);
      });

      await screen.findAllByRole("cell", { name: /^after/u });

      const drawn = rowAtTop(viewport);

      expect(drawn).toBeDefined();

      // Past the virtualizer's 150ms scroll debounce, which would re-report.
      await sleep(200);

      expect(rowAtTop(viewport)).toBe(drawn);
    }
  );

  it("should keep the row at the top when a row above it measures taller past the limit", async () => {
    const reach = 33_000_100 - 600;
    const scale = (reach + 49_000_000 - 33_000_000) / reach;
    const top = Math.floor((30_000_000 * scale) / 49);
    const tall = top - 5;
    const rowHeight = (index: number) => (index === tall ? 490 : 49);

    const { viewport } = await mountSheet({
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
      rowHeight,
      rows: 1_000_000,
      scrollHeight: () => 33_000_100,
    });

    viewport.scrollTop = 30_000_000;
    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(viewport.scrollTop).not.toBe(30_000_000);
    });
    fireEvent.scroll(viewport);

    expect(rowAtTop(viewport, rowHeight)).toBe(top);

    // The scrollbar lands where the corrected rows map to on the new scale.
    const measured = (reach + 49_000_441 - 33_000_000) / reach;

    expect(viewport.scrollTop).toBeCloseTo(
      (30_000_000 * scale + 441) / measured,
      0
    );
  });

  it("should clear a page's failure when the whole file's retry recovers", async () => {
    let fileReads = 0;
    let pageReads = 0;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) => {
      if (command === "read_csv_if_moved") {
        fileReads += 1;

        if (fileReads === 1) {
          return csvFile([["city"], ["Lima"]]);
        }

        return fileReads === 3 ? await failure() : null;
      }

      pageReads += 1;

      return pageReads === 1 ? await failure() : [["Lima"]];
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("button", { name: "try again" });
    act(() => {
      refreshTabs(() => true);
    });
    // The whole file's pane takes the sheet's place, overlay and all.
    await waitFor(() => {
      expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    });

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "try again" }));

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "try again" })
    ).not.toBeInTheDocument();
  });

  it("should clear a page's failure when a refresh finds the whole file readable again", async () => {
    let fileReads = 0;
    let pageReads = 0;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) => {
      if (command === "read_csv_if_moved") {
        fileReads += 1;

        if (fileReads === 1) {
          return csvFile([["city"], ["Lima"]]);
        }

        return fileReads === 3 ? await failure() : null;
      }

      pageReads += 1;

      return pageReads === 1 ? await failure() : [["Lima"]];
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("button", { name: "try again" });
    act(() => {
      refreshTabs(() => true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    });

    act(() => {
      refreshTabs(() => true);
    });

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "try again" })
    ).not.toBeInTheDocument();
  });

  it("should leave focus where the user put it when a page's failure clears", async () => {
    let revision = "r1";
    let failing = true;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) => {
      if (command === "read_csv_if_moved") {
        return csvFile([["city"], ["Lima"]], revision);
      }

      return failing ? await failure() : [["Lima"]];
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <input aria-label="search" />
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("button", { name: "try again" });

    const search = screen.getByRole("textbox", { name: "search" });

    await userEvent.setup().click(search);

    revision = "r2";
    failing = false;
    act(() => {
      refreshTabs(() => true);
    });

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it("should leave focus where the user put it when the whole file reads again", async () => {
    let fileReads = 0;

    const failure = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue({ kind: "failed", message: "Input/output error" });

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) => {
      if (command === "read_csv_if_moved") {
        fileReads += 1;

        if (fileReads === 1) {
          return csvFile([["city"], ["Lima"]]);
        }

        return fileReads === 2 ? await failure() : null;
      }

      return [["Lima"]];
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <input aria-label="search" />
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByRole("cell", { name: "Lima" });
    act(() => {
      refreshTabs(() => true);
    });
    await screen.findByRole("button", { name: "try again" });

    const search = screen.getByRole("textbox", { name: "search" });

    await userEvent.setup().click(search);
    act(() => {
      refreshTabs(() => true);
    });

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it("should give the sheet focus when its tab becomes active", async () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC((command) =>
      command === "read_csv_if_moved"
        ? csvFile([["city"], ["Lima"]])
        : [["Lima"]]
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });

    const sheet = (active: boolean) => (
      <QueryClientProvider client={client}>
        <button type="button">data.csv</button>
        <CsvSession
          active={active}
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    const { rerender } = render(sheet(false));

    await screen.findByRole("cell", { hidden: true, name: "Lima" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "data.csv" }));
    rerender(sheet(true));

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="scroll-area-viewport"]')
      ).toHaveFocus();
    });

    // Away and back again: each activation is an arrival.
    rerender(sheet(false));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "data.csv" }));
    rerender(sheet(true));

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="scroll-area-viewport"]')
      ).toHaveFocus();
    });
  });

  it.each([
    {
      arrival: "a failure",
      first: async (failure: () => Promise<never>) => await failure(),
      shown: async () =>
        await screen.findByRole("button", { name: "try again" }),
    },
    {
      arrival: "an empty file",
      first: () => csvFile([], "r0"),
      shown: async () => await screen.findByText("this file is empty"),
    },
  ])(
    "should leave focus where the user put it when a tab that arrived on $arrival fills",
    async ({ first, shown }) => {
      let fileReads = 0;

      const failure = vi
        .fn<() => Promise<never>>()
        .mockRejectedValue({ kind: "failed", message: "Input/output error" });

      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
        600
      );
      onTestFinished(() => {
        vi.restoreAllMocks();
      });
      mockIPC(async (command) => {
        if (command === "read_csv_if_moved") {
          fileReads += 1;

          return fileReads === 1
            ? await first(failure)
            : csvFile([["city"], ["Lima"]], "r1");
        }

        return [["Lima"]];
      });

      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });

      openTab("csv", "/Users/me/data.csv", true);
      const id = getTabState().activeId;
      onTestFinished(() => {
        closeTab(id);
        client.clear();
        clearMocks();
      });
      render(
        <QueryClientProvider client={client}>
          <input aria-label="search" />
          <CsvSession
            active
            tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
          />
        </QueryClientProvider>
      );

      await shown();

      const search = screen.getByRole("textbox", { name: "search" });

      await userEvent.setup().click(search);
      act(() => {
        refreshTabs(() => true);
      });

      expect(
        await screen.findByRole("cell", { name: "Lima" })
      ).toBeInTheDocument();
      expect(search).toHaveFocus();
    }
  );

  it.each([
    { key: "{ArrowDown}", rows: 1 },
    { key: "{PageDown}", rows: 11 },
    { key: " ", rows: 11 },
    { key: "{ArrowUp}", rows: -1 },
    { key: "{PageUp}", rows: -11 },
    { key: "{Shift>} {/Shift}", rows: -11 },
    { key: "{Alt>}{ArrowDown}{/Alt}", rows: 11 },
    { key: "{Meta>}{ArrowDown}{/Meta}", rows: 0 },
  ])(
    "should move the rows $key steps by, and no more, past the height limit",
    async ({ key, rows }) => {
      const { viewport } = await mountSheet({
        read: (start) =>
          Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
        rows: 1_000_000,
        scrollHeight: () => 33_000_100,
      });

      viewport.scrollTop = 20_000_000;
      fireEvent.scroll(viewport);

      const before = rowAtTop(viewport);

      expect(before).toBeDefined();

      const user = userEvent.setup();

      await user.click(viewport);
      await user.keyboard(key);
      fireEvent.scroll(viewport);

      await waitFor(() => {
        expect((rowAtTop(viewport) ?? 0) - (before ?? 0)).toBe(rows);
      });
    }
  );

  it("should leave keys to the browser below the height limit", async () => {
    const { viewport } = await mountSheet({
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
      rows: 2000,
      scrollHeight: () => 98_100,
    });

    viewport.scrollTop = 49_000;
    fireEvent.scroll(viewport);

    expect(fireEvent.keyDown(viewport, { key: "PageDown" })).toBeTruthy();
    expect(viewport.scrollTop).toBe(49_000);
  });

  it("should leave a key with Cmd or Ctrl to the browser past the height limit", async () => {
    const { viewport } = await mountSheet({
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
      rows: 1_000_000,
      scrollHeight: () => 33_000_100,
    });

    viewport.scrollTop = 20_000_000;
    fireEvent.scroll(viewport);

    expect(
      fireEvent.keyDown(viewport, { key: "ArrowDown", metaKey: true })
    ).toBeTruthy();
    expect(
      fireEvent.keyDown(viewport, { ctrlKey: true, key: "PageDown" })
    ).toBeTruthy();
  });

  it.each([
    { edge: "top", key: "{ArrowUp}", scrollTop: 0 },
    { edge: "bottom", key: "{ArrowDown}", scrollTop: 33_000_100 - 600 },
  ])(
    "should hold the sheet at its $edge when a key steps past it",
    async ({ key, scrollTop }) => {
      const { viewport } = await mountSheet({
        read: (start) =>
          Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
        rows: 1_000_000,
        scrollHeight: () => 33_000_100,
      });

      viewport.scrollTop = scrollTop;
      fireEvent.scroll(viewport);

      const before = rowAtTop(viewport);
      const user = userEvent.setup();

      await user.click(viewport);
      await user.keyboard(key);

      expect(rowAtTop(viewport)).toBe(before);
      expect(viewport.scrollTop).toBe(scrollTop);
    }
  );

  it("should move one row per arrow where WebKit floors scroll positions to its grid", async () => {
    let top = 0;

    const { viewport } = await mountSheet({
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
      rows: 1_000_000,
      scrollHeight: () => 33_000_100,
    });

    // WebKit floors a write to whole pixels, and to a 2px grid past 2^24.
    vi.spyOn(HTMLElement.prototype, "scrollTop", "get").mockImplementation(
      () => top
    );
    vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation(
      (value: number) => {
        const grid = value >= 2 ** 24 ? 2 : 1;

        top = Math.floor(value / grid) * grid;
      }
    );

    viewport.scrollTop = 20_000_000;
    fireEvent.scroll(viewport);

    const before = rowAtTop(viewport) ?? 0;
    const user = userEvent.setup();

    await user.click(viewport);
    await user.keyboard("{ArrowDown>100/}");

    await waitFor(() => {
      expect((rowAtTop(viewport) ?? 0) - before).toBe(100);
    });

    await user.keyboard("{ArrowUp>40/}");

    await waitFor(() => {
      expect((rowAtTop(viewport) ?? 0) - before).toBe(60);
    });
  });

  it("should keep rows in the viewport when a file a key moved through shrinks under the limit", async () => {
    let rows = 1_000_000;

    const { viewport } = await mountSheet({
      file: () => ({ revision: `r${rows}`, rows }),
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [
          `${rows === 1_000_000 ? "before" : "after"} ${start + row}`,
        ]),
      rows,
      scrollHeight: drawnHeight,
    });

    viewport.scrollTop = 20_000_000;
    fireEvent.scroll(viewport);
    await screen.findAllByRole("cell", { name: /^before [1-9]/u });

    const user = userEvent.setup();

    await user.click(viewport);
    await user.keyboard("{ArrowDown>3/}");

    rows = 650_000;
    act(() => {
      refreshTabs(() => true);
    });

    await screen.findAllByRole("cell", { name: /^after/u });

    expect(rowAtTop(viewport)).toBeDefined();
  });

  it("should keep the exact offset through size corrections where WebKit floors scroll positions", async () => {
    let top = 0;

    const { viewport } = await mountSheet({
      read: (start) =>
        Array.from({ length: 256 }, (_, row) => [`r${start + row}`]),
      rowHeight: alternatingRowHeight,
      rows: 1_000_000,
      scrollHeight: () => 33_000_100,
    });

    // WebKit floors a write to whole pixels, and to a 2px grid past 2^24, and
    // reports a move with a scroll event after the write.
    vi.spyOn(HTMLElement.prototype, "scrollTop", "get").mockImplementation(
      () => top
    );
    vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation(
      function scrollTop(this: HTMLElement, value: number) {
        const grid = value >= 2 ** 24 ? 2 : 1;
        const landed = Math.floor(value / grid) * grid;

        if (landed !== top) {
          top = landed;
          setTimeout(() => {
            this.dispatchEvent(new Event("scroll"));
          }, 0);
        }
      }
    );

    // The virtualizer's own corrections write through `scrollTo`.
    vi.spyOn(viewport, "scrollTo").mockImplementation((options) => {
      viewport.scrollTop = parse(ScrollTo, options).top;
    });

    viewport.scrollTop = 20_000_000;
    fireEvent.scroll(viewport);

    const before = rowAtTop(viewport, alternatingRowHeight);

    const user = userEvent.setup();

    await user.click(viewport);
    await user.keyboard("{ArrowUp>40/}");

    // Forty 49px steps over rows that average 61px.
    await waitFor(() => {
      expect(
        (rowAtTop(viewport, alternatingRowHeight) ?? 0) - (before ?? 0)
      ).toBe(-32);
    });
  });

  it("should leave focus where the user put it while the file loaded", async () => {
    const { promise, resolve } = Promise.withResolvers<string[][]>();

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) =>
      command === "read_csv_if_moved" ? csvFile(await promise) : [["Lima"]]
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <input aria-label="search" />
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByText("reading this file");

    const search = screen.getByRole("textbox", { name: "search" });

    await userEvent.setup().click(search);
    resolve([["city"], ["Lima"]]);

    expect(
      await screen.findByRole("cell", { name: "Lima" })
    ).toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it("should give the sheet focus when the file lands and the user has not moved it", async () => {
    const { promise, resolve } = Promise.withResolvers<string[][]>();

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) =>
      command === "read_csv_if_moved" ? csvFile(await promise) : [["Lima"]]
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });
    render(
      <QueryClientProvider client={client}>
        <CsvSession
          active
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    await screen.findByText("reading this file");
    resolve([["city"], ["Lima"]]);

    await screen.findByRole("cell", { name: "Lima" });

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="scroll-area-viewport"]')
      ).toHaveFocus();
    });
  });

  it("should give the sheet focus when a failure's retry takes the cursor with it", async () => {
    const page = vi
      .fn<() => Promise<string[][]>>()
      .mockRejectedValueOnce({ kind: "failed", message: "Input/output error" })
      .mockResolvedValue([["Lima"]]);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mockIPC(async (command) =>
      command === "read_csv_if_moved"
        ? csvFile([["city"], ["Lima"]])
        : await page()
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    openTab("csv", "/Users/me/data.csv", true);
    const id = getTabState().activeId;
    onTestFinished(() => {
      closeTab(id);
      client.clear();
      clearMocks();
    });

    const sheet = (active: boolean) => (
      <QueryClientProvider client={client}>
        <button type="button">data.csv</button>
        <CsvSession
          active={active}
          tab={{ id, kind: "csv", path: "/Users/me/data.csv" }}
        />
      </QueryClientProvider>
    );

    const { rerender } = render(sheet(false));

    await screen.findByRole("button", { hidden: true, name: "try again" });

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "data.csv" }));
    rerender(sheet(true));
    await user.tab();

    expect(screen.getByRole("button", { name: "try again" })).toHaveFocus();

    await user.keyboard("{Enter}");

    await screen.findByRole("cell", { name: "Lima" });
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="scroll-area-viewport"]')
      ).toHaveFocus();
    });
  });
});
