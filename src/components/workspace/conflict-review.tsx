import { cn } from "cn";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chord } from "@/components/chord";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  composeResolution,
  type Hunk,
  type MergeConflict,
  mergeDocuments,
  type Newline,
} from "@/core/merge";
import { useHotkeys } from "@/lib/ui/shortcuts";

const NOTE_FACE = "font-editor text-base leading-[1.65] whitespace-pre-wrap";
const HEADING_FACE = "font-editor font-semibold text-[1.88em] leading-[1.3]";
const FOLD_AFTER_LINES = 6;
const HEADING_LINE = /^#{1,6} /;

interface ContextRunProps {
  lines: string[];
}

function ContextRun({ lines }: ContextRunProps) {
  const [expanded, setExpanded] = useState(false);
  const expand = useCallback(() => setExpanded(true), []);
  if (lines.length > FOLD_AFTER_LINES && !expanded) {
    return (
      <Button
        className="self-start text-muted-foreground"
        onClick={expand}
        size="xs"
        variant="link"
      >
        {lines.length} unchanged lines
      </Button>
    );
  }
  return (
    <div className={cn(NOTE_FACE, "text-muted-foreground")}>
      {lines.join("\n")}
    </div>
  );
}

function isHeadingHunk(hunk: Hunk) {
  return [hunk.ours, hunk.theirs].every((side) => {
    const written = side.filter((line) => line !== "");
    return (
      written.length === 0 ||
      (written.length === 1 && HEADING_LINE.test(written[0] ?? ""))
    );
  });
}

function hunkCount(merge: MergeConflict) {
  return merge.regions.filter((region) => region.kind === "hunk").length;
}

function hunkKey(index: number, hunk: Hunk) {
  return [index, hunk.ours.join("\n"), hunk.theirs.join("\n")].join("\0");
}

interface SideProps {
  heading: boolean;
  label: string;
  lines: string[];
  onUse: () => void;
  useLabel: string;
}

function Side({ heading, label, lines, onUse, useLabel }: SideProps) {
  return (
    <>
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span>
        <Button aria-label={useLabel} onClick={onUse} size="xs" variant="ghost">
          use this
        </Button>
      </div>
      <div
        className={cn(
          "rounded-lg bg-card px-4 py-3",
          heading ? HEADING_FACE : NOTE_FACE,
          lines.length === 0 && "text-muted-foreground"
        )}
      >
        {lines.length === 0 ? "nothing" : lines.join("\n")}
      </div>
    </>
  );
}

interface PlaceProps {
  hunk: Hunk;
  newline: Newline;
  number: number;
  onChange: (key: string, result: string) => void;
  result: string;
  resultKey: string;
  total: number;
}

function Place({
  hunk,
  newline,
  number,
  onChange,
  result,
  resultKey,
  total,
}: PlaceProps) {
  const heading = isHeadingHunk(hunk);
  const resultId = useId();
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const useTheirs = useCallback(() => {
    onChange(resultKey, hunk.theirs.join(newline));
    resultRef.current?.focus();
  }, [hunk.theirs, newline, onChange, resultKey]);
  const useOurs = useCallback(() => {
    onChange(resultKey, hunk.ours.join(newline));
    resultRef.current?.focus();
  }, [hunk.ours, newline, onChange, resultKey]);
  const edit = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onChange(resultKey, event.target.value),
    [onChange, resultKey]
  );
  return (
    <section aria-label={`place ${number} of ${total}`} className="grid gap-2">
      <Side
        heading={heading}
        label="on disk"
        lines={hunk.theirs}
        onUse={useTheirs}
        useLabel="use the version on disk"
      />
      <Side
        heading={heading}
        label="mine"
        lines={hunk.ours}
        onUse={useOurs}
        useLabel="use mine"
      />
      <Label
        className="font-normal text-muted-foreground text-xs"
        htmlFor={resultId}
      >
        result<span className="sr-only"> for place {number}</span>
      </Label>
      <Textarea
        className={cn(
          "md:text-base",
          heading ? HEADING_FACE : NOTE_FACE,
          "placeholder:font-normal placeholder:font-sans placeholder:text-sm"
        )}
        id={resultId}
        onChange={edit}
        placeholder="use one side above, or write the result"
        ref={resultRef}
        value={result}
      />
    </section>
  );
}

interface ConflictReviewProps {
  base: string;
  changedAgain: boolean;
  onBack: () => void;
  onResolve: (content: string) => void;
  /** Whether the review is the visible pane; it takes focus on becoming so. */
  open: boolean;
  ours: string;
  theirs: string;
}

/** The pane that replaces the editor while overlapping edits wait for a result. */
export function ConflictReview({
  base,
  changedAgain,
  onBack,
  onResolve,
  open,
  ours,
  theirs,
}: ConflictReviewProps) {
  const merge = useMemo(
    () => mergeDocuments(ours, base, theirs),
    [ours, base, theirs]
  );
  const [results, setResults] = useState<Record<string, string>>({});
  const setResult = useCallback(
    (key: string, result: string) =>
      setResults((previous) => ({ ...previous, [key]: result })),
    []
  );
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      const first =
        container.current?.querySelector<HTMLElement>("textarea") ??
        container.current?.querySelector<HTMLElement>("[data-slot=button]");
      first?.focus({ preventScroll: true });
    }
  }, [open]);

  const { choices, remaining, rows } = useMemo(() => {
    const built: {
      choices: { edited: string }[];
      remaining: number;
      rows: ReactNode[];
    } = { choices: [], remaining: 0, rows: [] };
    if (merge.kind !== "conflict") {
      return built;
    }
    const total = hunkCount(merge);
    let position = 0;
    for (const region of merge.regions) {
      position += 1;
      if (region.kind === "ok") {
        built.rows.push(
          <ContextRun key={`${position}:ok`} lines={region.lines} />
        );
        continue;
      }
      const key = hunkKey(position, region);
      const result = results[key];
      if (result === undefined) {
        built.remaining += 1;
      }
      built.choices.push({ edited: result ?? "" });
      built.rows.push(
        <Place
          hunk={region}
          key={key}
          newline={merge.newline}
          number={built.choices.length}
          onChange={setResult}
          result={result ?? ""}
          resultKey={key}
          total={total}
        />
      );
    }
    return built;
  }, [merge, results, setResult]);
  const places = choices.length;
  const resolve = useCallback(() => {
    if (remaining > 0) {
      return;
    }
    onResolve(
      merge.kind === "merged"
        ? merge.content
        : composeResolution(merge, choices)
    );
  }, [choices, merge, onResolve, remaining]);
  useHotkeys([
    { callback: onBack, hotkey: "Escape", options: { enabled: open } },
    { callback: resolve, hotkey: "Mod+Enter", options: { enabled: open } },
  ]);

  return (
    <section
      aria-label="review overlapping edits"
      className={cn(
        "absolute inset-0 overflow-auto bg-background",
        !open && "pointer-events-none invisible"
      )}
      ref={container}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        {merge.kind === "merged" ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                your edits no longer overlap the change on disk
              </EmptyTitle>
              <EmptyDescription>resolve applies both</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-sm">
              {`${places} ${places === 1 ? "place" : "places"} changed here and on disk`}
            </h2>
            <p className="text-muted-foreground text-xs">
              the rest already combined; only these need a result
            </p>
            {changedAgain ? (
              <p className="text-destructive text-xs">
                the file changed again while you were reviewing, so these start
                over
              </p>
            ) : null}
          </div>
        )}
        {rows}
        <div className="flex items-center gap-2 pt-2">
          <Button disabled={remaining > 0} onClick={resolve} size="sm">
            resolve
          </Button>
          <Button onClick={onBack} size="sm" variant="ghost">
            back
          </Button>
          <span className="text-muted-foreground text-xs">
            {remaining > 0
              ? `${remaining} of ${places} still need a result`
              : "every place has a result"}
          </span>
          <span className="ms-auto flex items-center gap-3 text-muted-foreground text-xs">
            <KbdGroup>
              <Chord hotkey="Escape" />
              <span>back</span>
            </KbdGroup>
            <KbdGroup>
              <Chord hotkey="Mod+Enter" />
              <span>resolve</span>
            </KbdGroup>
          </span>
        </div>
      </div>
    </section>
  );
}
