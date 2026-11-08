import { useQueries, useQuery } from "@tanstack/react-query";
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  Virtualizer,
} from "@tanstack/virtual-core";
import type { VirtualItem } from "@tanstack/virtual-core";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FailureNotice } from "@/components/failure-notice";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import { FileError } from "@/core/errors";
import { csvQuery, csvRowsQuery } from "@/data/queries";
import { activateTab, closeTab, registerTabRefresh } from "@/lib/tabs/store";
import { tabButtonId, tabPanelId } from "@/lib/tabs/tab";
import type { Tab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import type { CsvFile } from "@/server/adapters/bindings";

import { UnreadableFile } from "./unreadable-file";

const READ_FAILED = "could not read this file";

/** One line of body text at the table's leading plus the cell padding and rule, the height a row has before it is measured. */
const ROW_ESTIMATE_PX = 49;

/** The tallest the rows are drawn, under the 33,554,432px WebKit clamps a layout to. */
const MAX_SHEET_PX = 33_000_000;

/**
 * How many pixels of rows one scrolled pixel covers: 1, unless the rows are
 * taller than an element can be, when the whole range maps onto what scrolls.
 */
// ponytail: a wheel tick covers `scale` times its distance, so past about 4 million rows it skips rows; keys step through a held row offset instead. Page the scroll range if the wheel bites.
function scrollScale(instance: Virtualizer<HTMLElement, HTMLTableRowElement>) {
  const element = instance.scrollElement;
  const total = instance.getTotalSize();

  if (element === null || total <= MAX_SHEET_PX) {
    return 1;
  }

  const reach = element.scrollHeight - element.clientHeight;

  return reach > 0 ? (reach + total - MAX_SHEET_PX) / reach : 1;
}

/**
 * How far a key moves the sheet in pixels of rows, or null for a key that does
 * not scroll it. Option with an arrow is a page, as it is in WebKit on macOS.
 */
function keyStep(event: KeyboardEvent, viewHeight: number) {
  if (event.ctrlKey || event.metaKey) {
    return null;
  }

  const page = viewHeight - ROW_ESTIMATE_PX;
  const line = event.altKey ? page : ROW_ESTIMATE_PX;

  const steps = new Map([
    [" ", event.shiftKey ? -page : page],
    ["ArrowDown", line],
    ["ArrowUp", -line],
    ["PageDown", page],
    ["PageUp", -page],
  ]);

  return steps.get(event.key) ?? null;
}

/**
 * Where a key or a size correction last moved the rows, and the `scrollTop`
 * that landed for it.
 * WebKit floors a `scrollTop` write to whole pixels, and to a 2px grid past
 * 2^24, so a row step past the cap can be smaller than the element can hold.
 * The rows follow the held offset while the element sits where the write
 * landed; any other scroll lets go of it.
 */
function heldOffset() {
  let held: { offset: number; top: number } | null = null;

  return {
    /** The held offset while the element sits at `top`, else null. */
    at: (top: number) => (held?.top === top ? held.offset : null),
    hold: (offset: number, top: number) => {
      held = { offset, top };
    },
    release: () => {
      held = null;
    },
  };
}

interface RowWindow {
  height: number;
  items: VirtualItem[];
  shift: number;
}

/**
 * Which body rows sit near the viewport, how tall the sheet is drawn, and how
 * far a row's drawn position sits from where the virtualizer placed it. Past
 * the height cap it also takes the arrow, page and space keys on the viewport
 * and steps the sheet by rows, since a scrolled pixel there covers more than one.
 *
 * The core virtualizer rather than its React hook: the hook answers with
 * methods the React Compiler cannot memoize, so it bails out of any component
 * calling it. Reading the window into state on each change keeps the render a
 * function of state, which the compiler can follow.
 */
function useRowWindow(viewport: HTMLElement | null, count: number) {
  const [window, setWindow] = useState<RowWindow>({
    height: 0,
    items: [],
    shift: 0,
  });

  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [{ held, virtualizer }] = useState(() => {
    const holder = heldOffset();

    return {
      held: holder,
      virtualizer: new Virtualizer<HTMLElement, HTMLTableRowElement>({
        count,
        estimateSize: () => ROW_ESTIMATE_PX,
        getScrollElement: () => viewport,
        // A scaled offset sits past the element's own max, which the
        // virtualizer takes for overscroll unless the element is at rest.
        observeElementOffset: (instance, report) =>
          observeElementOffset(instance, (offset, scrolling) => {
            const kept = holder.at(offset);

            if (kept !== null) {
              report(kept, false);

              return;
            }

            const scale = scrollScale(instance);

            holder.release();
            report(offset * scale, scale === 1 && scrolling);
          }),
        observeElementRect,
        onChange: (instance) => {
          const scale = scrollScale(instance);

          setWindow({
            height: Math.min(instance.getTotalSize(), MAX_SHEET_PX),
            items: instance.getVirtualItems(),
            shift:
              scale === 1
                ? 0
                : (instance.scrollElement?.scrollTop ?? 0) -
                  (instance.scrollOffset ?? 0),
          });
        },
        overscan: 20,
        scrollToFn: (offset, { adjustments = 0, behavior }, instance) => {
          const scale = scrollScale(instance);

          elementScroll((offset + adjustments) / scale, { behavior }, instance);

          // A size correction lands on the same grid a key's write does.
          if (scale !== 1 && instance.scrollElement !== null) {
            holder.hold(offset + adjustments, instance.scrollElement.scrollTop);
          }
        },
      }),
    };
  });

  // `measure` drops the row heights, which a re-read file invalidates anyway,
  // and it is the one call that pushes a fresh window without a scroll.
  useLayoutEffect(() => {
    virtualizer.setOptions({
      ...virtualizer.options,
      count,
      getScrollElement: () => viewport,
    });
    virtualizer._willUpdate();
    virtualizer.measure();
    // The scale moved with the row count, and a sheet held at its cap scrolls
    // nothing to say so. A held offset belongs to the old scale.
    held.release();
    viewport?.dispatchEvent(new Event("scroll"));
  }, [count, held, viewport, virtualizer]);

  // A sheet that grows to its cap has a new scale only once that height is
  // drawn, after the re-report above read the old one.
  useLayoutEffect(() => {
    if (window.height === MAX_SHEET_PX) {
      viewport?.dispatchEvent(new Event("scroll"));
    }
  }, [viewport, window.height]);

  useEffect(() => virtualizer._didMount(), [virtualizer]);

  // Past the cap a scrolled pixel covers `scale` pixels of rows, so a key's own
  // step would skip rows. Keys step in rows there instead; the wheel keeps the
  // ratio, with the ceiling `scrollScale` states.
  useEffect(() => {
    const stepRows = (event: KeyboardEvent) => {
      const scale = scrollScale(virtualizer);

      const step =
        viewport === null ? null : keyStep(event, viewport.clientHeight);

      if (viewport === null || scale === 1 || step === null) {
        return;
      }

      event.preventDefault();

      const reach = viewport.scrollHeight - viewport.clientHeight;

      // The held offset, once a step has reported it.
      const from = virtualizer.scrollOffset ?? 0;

      const offset = Math.min(Math.max(from + step, 0), reach * scale);

      viewport.scrollTop = offset / scale;
      held.hold(offset, viewport.scrollTop);
      // A step inside WebKit's grid moves nothing, so nothing would report it.
      viewport.dispatchEvent(new Event("scroll"));
    };

    viewport?.addEventListener("keydown", stepRows);

    return () => {
      viewport?.removeEventListener("keydown", stepRows);
    };
  }, [held, viewport, virtualizer]);

  return { ...window, measureRow: virtualizer.measureElement };
}

interface ColumnProbeProps {
  file: CsvFile;
  onMeasure: (widths: number[]) => void;
}

/**
 * A hidden table the browser lays out under auto layout, from the header and
 * each column's longest cells, whose header cells come out at the width each
 * column needs. It measures once, on mount, so the caller keys it to remount
 * for each revision of the file.
 */
function ColumnProbe({ file, onMeasure }: ColumnProbeProps) {
  const table = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    onMeasure(
      Array.from(table.current?.querySelectorAll("thead th") ?? [], (cell) =>
        Math.ceil(cell.getBoundingClientRect().width)
      )
    );
  }, [onMeasure]);

  return (
    <table aria-hidden className="csv-sheet invisible absolute" ref={table}>
      <thead>
        <tr>
          {file.header.map((cell, index) => (
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a column has no identity beyond its position
            <th key={index}>
              <div className="csv-probe-cell">{cell}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {file.probe.map((row, rowIndex) => (
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a probe row has no identity beyond its position
          <tr key={rowIndex}>
            {row.map((cell, index) => (
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a column has no identity beyond its position
              <td key={index}>
                <div className="csv-probe-cell">{cell}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface SheetProps {
  attempt: number;
  file: CsvFile;
  onPageFailed: (failed: Error) => void;
  tab: Tab;
  viewport: HTMLElement | null;
}

/**
 * The header row and a window of body rows. Only the rows near the viewport
 * exist in the DOM, and only their pages are read from disk, so a file of any
 * length costs the same to draw; spacer rows above and below hold the table
 * at its full height, or the tallest it can be, so the scrollbar stays true to
 * where the window sits in the file.
 *
 * The columns take the widths the probe measures, because the window alone
 * would resize them as rows scroll in and out.
 */
function Sheet({ attempt, file, onPageFailed, tab, viewport }: SheetProps) {
  const [widths, setWidths] = useState<number[]>([]);

  const { height, items, measureRow, shift } = useRowWindow(
    viewport,
    file.rows
  );

  const [first] = items;
  const last = items.at(-1);
  const above = (first?.start ?? 0) + shift;
  const below = last === undefined ? 0 : height - last.end - shift;
  const firstPage = Math.floor((first?.index ?? 0) / file.page);
  const lastPage = Math.floor((last?.index ?? 0) / file.page);

  const pages = useQueries({
    queries: file.pages.slice(firstPage, lastPage + 1).map((start) =>
      csvRowsQuery(
        {
          attempt,
          id: tab.id,
          path: tab.path,
          revision: file.revision,
          start,
        },
        onPageFailed
      )
    ),
  });

  const cells = (index: number) => {
    const row =
      pages[Math.floor(index / file.page) - firstPage]?.data?.[
        index % file.page
      ];

    return file.header.map((_, column) => row?.[column] ?? "");
  };

  return (
    <>
      <ColumnProbe file={file} key={file.revision} onMeasure={setWidths} />
      <table className="csv-sheet">
        <colgroup>
          {widths.map((width, index) => (
            <col
              className="w-(--column)"
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a column has no identity beyond its position
              key={index}
              style={{ "--column": `${width}px` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {file.header.map((cell, index) => (
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a column has no identity beyond its position
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {above > 0 ? (
            <tr
              aria-hidden
              className="h-(--spacer)"
              style={{ "--spacer": `${above}px` }}
            />
          ) : null}
          {items.map((item) => (
            <tr data-index={item.index} key={item.key} ref={measureRow}>
              {cells(item.index).map((cell, index) => (
                // oxlint-disable-next-line react-doctor/no-array-index-as-key -- a column has no identity beyond its position
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
          {below > 0 ? (
            <tr
              aria-hidden
              className="h-(--spacer)"
              style={{ "--spacer": `${below}px` }}
            />
          ) : null}
        </tbody>
      </table>
    </>
  );
}

interface PageFailure {
  errors: number;
  failed: Error;
  revision: string;
}

interface CsvSessionProps {
  active: boolean;
  tab: Tab;
}

/**
 * One open csv, read-only: the file on disk drawn as a table. It re-reads when
 * the window regains focus or the watcher reports the file, and never writes.
 */
export function CsvSession({ active, tab }: CsvSessionProps) {
  const {
    data: file,
    error,
    errorUpdateCount,
    refetch,
  } = useQuery(csvQuery(tab.id, tab.path));

  // State rather than a ref: the row window needs a render once the viewport exists.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [pageFailure, setPageFailure] = useState<PageFailure | null>(null);
  const [pageAttempt, setPageAttempt] = useState(0);

  const attachScrollArea = (root: HTMLDivElement | null) => {
    setViewport(
      root?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null
    );
  };

  // A page's failure lasts as long as the revision that placed the page, and
  // until the whole file fails, since the sheet reads its pages again after.
  const failedPage =
    pageFailure !== null &&
    pageFailure.revision === file?.revision &&
    pageFailure.errors === errorUpdateCount
      ? pageFailure.failed
      : undefined;

  const failure = error ?? failedPage ?? null;
  // Only a missing file is a deletion. A permission or parse failure leaves the
  // tab open to say why and try again.
  const gone = failure instanceof FileError && failure.kind === "not-found";
  const reason = failure === null || gone ? undefined : reasonOf(failure);

  useEffect(() => {
    if (reason !== undefined) {
      toast.add({
        description: reason,
        title: READ_FAILED,
        type: "error",
      });
    }
  }, [reason]);

  useEffect(() => {
    if (gone) {
      closeTab(tab.id);
    }
  }, [gone, tab.id]);

  useEffect(
    () =>
      registerTabRefresh(tab.id, async () => {
        await refetch();
      }),
    [refetch, tab.id]
  );

  // The sheet takes focus whenever it is there to take it, which is what lets
  // the keyboard scroll the table, unless the user has put focus somewhere
  // since the tab became active. A failure's button takes focus to the body
  // when it goes, and the body counts as nowhere.
  const focusAtActivation = useRef<Element | null>(null);

  useEffect(() => {
    if (active) {
      focusAtActivation.current = document.activeElement;
    }
  }, [active]);

  useEffect(() => {
    const untouched =
      document.activeElement === focusAtActivation.current ||
      document.activeElement === document.body;

    if (active && reason === undefined && untouched) {
      viewport?.focus();
    }
  }, [active, reason, viewport]);

  // A page is refused once the file moved on, which reading the file settles
  // with no word to the user. The same revision means the page itself failed.
  const recoverPage = async (failed: Error) => {
    const { data, error: unread, errorUpdateCount: errors } = await refetch();

    if (
      unread === null &&
      data !== undefined &&
      data.revision === file?.revision
    ) {
      setPageFailure({ errors, failed, revision: data.revision });
    }
  };

  if (reason !== undefined && error !== null) {
    return (
      <UnreadableFile
        active={active}
        id={tab.id}
        reason={reason}
        retry={() => {
          activateTab(tab.id);
          void refetch();
        }}
        title={READ_FAILED}
      />
    );
  }

  const body = (() => {
    if (file === undefined) {
      return (
        <div className="animate-in fade-in fill-mode-backwards flex flex-1 flex-col delay-300">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>reading this file</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    if (file.header.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>this file is empty</EmptyTitle>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <ScrollArea
          className="min-h-0 flex-1 select-text"
          inert={reason !== undefined}
          ref={attachScrollArea}
        >
          <div className="typeset typeset-note p-6">
            <Sheet
              attempt={pageAttempt}
              file={file}
              onPageFailed={(failed) => {
                void recoverPage(failed);
              }}
              tab={tab}
              viewport={viewport}
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {reason === undefined ? null : (
          <div className="bg-background absolute inset-0 flex flex-col">
            <FailureNotice
              reason={reason}
              retry={() => {
                setPageFailure(null);
                setPageAttempt(pageAttempt + 1);
              }}
              title={READ_FAILED}
            />
          </div>
        )}
      </>
    );
  })();

  return (
    <div
      aria-labelledby={tabButtonId(tab.id)}
      className={cn("absolute inset-0 flex flex-col", !active && "opacity-0")}
      id={tabPanelId(tab.id)}
      inert={!active}
      role="tabpanel"
    >
      {body}
    </div>
  );
}
