import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { cn } from "cn";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MentionItem } from "@/components/notes/note-mentions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { graphOf } from "@/core/graph";
import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { noteQueries } from "@/data/queries";
import type { Tab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { hideGraph, hopTo } from "@/lib/ui/graph";
import { setMentionsOpen } from "@/lib/ui/mentions";

import type { RingPosition } from "./layout";
import { clockwiseFrom, layoutRing } from "./layout";

/** Past this a side reads as a fan no longer; the rest go behind a count. */
const CAP = 12;

const CENTRE: RingPosition = { angle: Number.NaN, x: 0.5, y: 0.5 };

const OVERFLOW_IN = "overflow:in";
const OVERFLOW_OUT = "overflow:out";

const OVERFLOW_CLASS =
  "-translate-x-1/2 -translate-y-1/2 absolute bg-background text-muted-foreground tabular-nums outline-none hover:text-foreground";

const MENU_CLASS =
  "w-72 border border-border shadow-[0_8px_24px_rgb(0_0_0/0.18)] ring-0";

interface Node {
  /** On both sides: it links here and is linked from here. */
  both: boolean;
  note: NoteMeta;
  position: RingPosition;
}

type Step = -1 | 1;

/** What every pill on the ring answers to: arrows walk, esc leaves. */
interface RingKeys {
  onLeave: () => void;
  onWalk: (from: string, step: Step) => void;
}

type PillRef = (key: string, element: HTMLButtonElement | null) => void;

/** The most recently updated eleven, kept in the side's own order. */
function capped(notes: NoteMeta[]) {
  if (notes.length <= CAP) {
    return { hidden: 0, shown: notes };
  }

  const recent = new Set(
    notes
      .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, CAP - 1)
      .map((note) => note.path)
  );

  return {
    hidden: notes.length - (CAP - 1),
    shown: notes.filter((note) => recent.has(note.path)),
  };
}

function useStageSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ height: 0, width: 0 });

  useLayoutEffect(() => {
    const stage = ref.current;

    if (stage === null) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({
          height: entry.contentRect.height,
          width: entry.contentRect.width,
        });
      }
    });

    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
}

function ringKeyDown(
  event: KeyboardEvent,
  from: string,
  { onLeave, onWalk }: RingKeys
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onLeave();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    onWalk(from, 1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    onWalk(from, -1);
  }
}

function pillStyle(position: RingPosition) {
  return {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
  };
}

interface HairlineProps {
  both?: boolean;
  /** Leads to a placeholder rather than a note. */
  dashed?: boolean;
  live?: boolean;
  position: RingPosition;
  size: { height: number; width: number };
}

/** A line from the centre to a pill, sized and turned in pixels so it can glide with the pill. */
function Hairline({
  both = false,
  dashed = false,
  live = false,
  position,
  size,
}: HairlineProps) {
  const dx = (position.x - 0.5) * size.width;
  const dy = (position.y - 0.5) * size.height;

  return (
    <div
      aria-hidden
      className={cn(
        "absolute top-1/2 left-1/2 origin-left transition-[width,rotate,background-color] duration-150 ease-out",
        dashed && "h-0 border-border border-t border-dashed",
        !dashed && "h-px",
        !dashed && (live ? "bg-foreground" : "bg-border")
      )}
      style={{
        rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`,
        width: `${Math.hypot(dx, dy)}px`,
      }}
    >
      {both ? (
        <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-inherit" />
      ) : null}
    </div>
  );
}

interface PillProps {
  centre: boolean;
  keys: RingKeys;
  node: Node;
  onHop: (path: string, beside: boolean) => void;
  onLive: (path: string | null) => void;
  pillRef: PillRef;
}

function Pill({ centre, keys, node, onHop, onLive, pillRef }: PillProps) {
  const { path } = node.note;

  const attach = useCallback(
    (element: HTMLButtonElement | null) => {
      pillRef(path, element);
    },
    [path, pillRef]
  );

  const click = useCallback(
    (event: MouseEvent) => {
      if (centre) {
        keys.onLeave();
      } else {
        onHop(path, event.metaKey);
      }
    },
    [centre, keys, onHop, path]
  );

  // A native button turns ⏎ into a click, but that click carries no modifier.
  const keyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.metaKey && !centre) {
        event.preventDefault();
        onHop(path, true);
      } else {
        ringKeyDown(event, path, keys);
      }
    },
    [centre, keys, onHop, path]
  );

  const live = useCallback(() => {
    onLive(path);
  }, [onLive, path]);

  const idle = useCallback(() => {
    onLive(null);
  }, [onLive]);

  return (
    <Badge
      className={cn(
        "absolute max-w-48 -translate-x-1/2 -translate-y-1/2 bg-background outline-none transition-[left,top] duration-150 ease-out hover:text-foreground focus-visible:text-foreground",
        centre ? "h-7 px-3 text-foreground text-sm" : "text-muted-foreground"
      )}
      onBlur={idle}
      onClick={click}
      onFocus={live}
      onKeyDown={keyDown}
      onMouseEnter={live}
      onMouseLeave={idle}
      render={<button ref={attach} type="button" />}
      style={pillStyle(node.position)}
      variant="ghost"
    >
      <span className="truncate">{node.note.title}</span>
    </Badge>
  );
}

interface PlaceholderProps {
  position: RingPosition;
  target: string;
}

/** A link that names no note: shown, since the note may yet be written, and opening nothing. */
function Placeholder({ position, target }: PlaceholderProps) {
  return (
    <Badge
      className="absolute max-w-48 -translate-x-1/2 -translate-y-1/2 bg-background text-faint"
      style={pillStyle(position)}
      variant="ghost"
    >
      <span className="truncate">{target}</span>
    </Badge>
  );
}

function useOverflowPill(id: string, keys: RingKeys, pillRef: PillRef) {
  const attach = useCallback(
    (element: HTMLButtonElement | null) => {
      pillRef(id, element);
    },
    [id, pillRef]
  );

  const keyDown = useCallback(
    (event: KeyboardEvent) => {
      ringKeyDown(event, id, keys);
    },
    [id, keys]
  );

  return { attach, keyDown };
}

interface OverflowProps {
  count: number;
  keys: RingKeys;
  pillRef: PillRef;
  position: RingPosition;
}

/** The rest of the left side as a count, and a door to the strip's mentions list. */
function OverflowMentions({
  count,
  keys,
  onShow,
  pillRef,
  position,
}: OverflowProps & { onShow: () => void }) {
  const { attach, keyDown } = useOverflowPill(OVERFLOW_IN, keys, pillRef);

  return (
    <Badge
      className={OVERFLOW_CLASS}
      onClick={onShow}
      onKeyDown={keyDown}
      render={<button ref={attach} type="button" />}
      style={pillStyle(position)}
      variant="ghost"
    >
      +{count}
    </Badge>
  );
}

/** The rest of the right side as a count, opening every note this one links to. */
function OverflowLinks({
  count,
  keys,
  outgoing,
  pillRef,
  position,
}: OverflowProps & { outgoing: Mention[] }) {
  const { attach, keyDown } = useOverflowPill(OVERFLOW_OUT, keys, pillRef);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Badge
            className={OVERFLOW_CLASS}
            onKeyDown={keyDown}
            render={<button ref={attach} type="button" />}
            style={pillStyle(position)}
            variant="ghost"
          />
        }
      >
        +{count}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={MENU_CLASS} side="bottom">
        {outgoing.map((mention) => (
          <MentionItem key={mention.note.path} mention={mention} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NoteGraphProps {
  center: NoteMeta;
  dangling: string[];
  incoming: Mention[];
  onHop: (path: string, beside: boolean) => void;
  onLeave: () => void;
  onShowMentions: () => void;
  outgoing: Mention[];
}

/**
 * The note in the centre, what mentions it fanned on the left, what it links
 * to fanned on the right. Pills are keyed by path and placed by percentage, so
 * a note on screen before and after a hop is one element gliding to its new
 * place rather than two.
 */
export function NoteGraph({
  center,
  dangling,
  incoming,
  onHop,
  onLeave,
  onShowMentions,
  outgoing,
}: NoteGraphProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pills = useRef(new Map<string, HTMLButtonElement>());
  const size = useStageSize(stageRef);
  const [live, setLive] = useState<string | null>(null);

  const { nodes, overflow, placeholders, ring } = useMemo(() => {
    const linked = new Set(outgoing.map((mention) => mention.note.path));
    const mentioned = new Set(incoming.map((mention) => mention.note.path));
    const left = capped(
      incoming
        .map((mention) => mention.note)
        .filter((note) => !linked.has(note.path))
    );
    // Real links first, then what room the cap leaves for placeholders.
    const right = capped(outgoing.map((mention) => mention.note));
    const room = Math.max(
      0,
      CAP - right.shown.length - (right.hidden > 0 ? 1 : 0)
    );
    const shownDangling = dangling.slice(0, room);
    const hiddenRight = right.hidden + (dangling.length - shownDangling.length);
    const positions = layoutRing(
      left.shown.length + (left.hidden > 0 ? 1 : 0),
      right.shown.length + shownDangling.length + (hiddenRight > 0 ? 1 : 0)
    );
    const place = (side: NoteMeta[], slots: RingPosition[]) =>
      side.flatMap((note, index) => {
        const position = slots[index];

        return position === undefined
          ? []
          : [
              {
                both: linked.has(note.path) && mentioned.has(note.path),
                note,
                position,
              },
            ];
      });
    const placed = [
      ...place(left.shown, positions.incoming),
      ...place(right.shown, positions.outgoing),
    ];
    const overflowIn = left.hidden > 0 ? positions.incoming.at(-1) : undefined;
    const overflowOut = hiddenRight > 0 ? positions.outgoing.at(-1) : undefined;

    return {
      nodes: [{ both: false, note: center, position: CENTRE }, ...placed],
      overflow: {
        incoming:
          overflowIn === undefined
            ? undefined
            : { count: left.hidden, position: overflowIn },
        outgoing:
          overflowOut === undefined
            ? undefined
            : { count: hiddenRight, position: overflowOut },
      },
      placeholders: shownDangling.flatMap((target, index) => {
        const position = positions.outgoing[right.shown.length + index];

        return position === undefined ? [] : [{ position, target }];
      }),
      // Clockwise from the top, which is the order the arrows walk. A
      // placeholder is not on it: there is nothing to hop to.
      ring: [
        ...placed.map((node) => ({
          angle: node.position.angle,
          key: node.note.path,
        })),
        ...(overflowIn === undefined
          ? []
          : [{ angle: overflowIn.angle, key: OVERFLOW_IN }]),
        ...(overflowOut === undefined
          ? []
          : [{ angle: overflowOut.angle, key: OVERFLOW_OUT }]),
      ].toSorted((a, b) => clockwiseFrom(a.angle) - clockwiseFrom(b.angle)),
    };
  }, [center, dangling, incoming, outgoing]);

  const pillRef = useCallback<PillRef>((key, element) => {
    if (element === null) {
      pills.current.delete(key);
    } else {
      pills.current.set(key, element);
    }
  }, []);

  // Landing, whether by toggle or by hop, puts the hand on the centre.
  useEffect(() => {
    pills.current.get(center.path)?.focus();
  }, [center.path]);

  const onWalk = useCallback(
    (from: string, step: Step) => {
      if (ring.length === 0) {
        return;
      }

      const at = ring.findIndex((entry) => entry.key === from);
      const next = at === -1 ? 0 : (at + step + ring.length) % ring.length;

      pills.current.get(ring[next]?.key ?? "")?.focus();
    },
    [ring]
  );

  const keys = useMemo(() => ({ onLeave, onWalk }), [onLeave, onWalk]);

  const lone =
    incoming.length === 0 && outgoing.length === 0 && dangling.length === 0;

  return (
    <div className="relative h-full w-full select-none" ref={stageRef}>
      {lone ? null : (
        <>
          <span className="absolute top-[6%] left-[12%] -translate-x-1/2 text-faint text-xs">
            mentions
          </span>
          <span className="absolute top-[6%] left-[88%] -translate-x-1/2 text-faint text-xs">
            links
          </span>
        </>
      )}
      {nodes
        .filter((node) => !Number.isNaN(node.position.angle))
        .map((node) => (
          <Hairline
            both={node.both}
            key={node.note.path}
            live={live === node.note.path}
            position={node.position}
            size={size}
          />
        ))}
      {placeholders.map(({ position, target }) => (
        <Hairline
          dashed
          key={`dangling:${target}`}
          position={position}
          size={size}
        />
      ))}
      {overflow.incoming === undefined ? null : (
        <Hairline position={overflow.incoming.position} size={size} />
      )}
      {overflow.outgoing === undefined ? null : (
        <Hairline position={overflow.outgoing.position} size={size} />
      )}
      {nodes.map((node) => (
        <Pill
          centre={node.note.path === center.path}
          key={node.note.path}
          keys={keys}
          node={node}
          onHop={onHop}
          onLive={setLive}
          pillRef={pillRef}
        />
      ))}
      {placeholders.map(({ position, target }) => (
        <Placeholder
          key={`dangling:${target}`}
          position={position}
          target={target}
        />
      ))}
      {overflow.incoming === undefined ? null : (
        <OverflowMentions
          count={overflow.incoming.count}
          keys={keys}
          onShow={onShowMentions}
          pillRef={pillRef}
          position={overflow.incoming.position}
        />
      )}
      {overflow.outgoing === undefined ? null : (
        <OverflowLinks
          count={overflow.outgoing.count}
          keys={keys}
          outgoing={outgoing}
          pillRef={pillRef}
          position={overflow.outgoing.position}
        />
      )}
      {lone ? (
        <p className="absolute top-[calc(50%+2rem)] left-1/2 -translate-x-1/2 whitespace-nowrap text-faint text-xs">
          no links yet, and nothing mentions it
        </p>
      ) : null}
    </div>
  );
}

interface TabGraphProps {
  tab: Tab;
}

/**
 * Reads the tab's graph and keeps the last one it had while the next loads,
 * so a hop is a glide between two pictures rather than a blank between them.
 */
export function TabGraph({ tab }: TabGraphProps) {
  const { data: links } = useSuspenseQuery(noteQueries.links());
  const { data: notes } = useSuspenseQuery(noteQueries.list());
  const center = notes.find((meta) => meta.path === tab.path);
  const bare = useQuery({
    ...noteQueries.mentions(tab.path, center?.title ?? ""),
    enabled: center !== undefined,
  });
  const reported = useRef(false);

  useEffect(() => {
    if (bare.error !== null && bare.data === undefined && !reported.current) {
      reported.current = true;
      toast.add({
        description: reasonOf(bare.error),
        title: "could not read the graph",
        type: "error",
      });
    }
  }, [bare.data, bare.error]);

  // A failed read of the bare mentions leaves the links, which are already
  // here; a blank pane over a hidden editor would say less than the toast.
  const rows = bare.data ?? (bare.error === null ? undefined : []);
  const graph = useMemo(
    () =>
      center === undefined || rows === undefined
        ? undefined
        : { center, ...graphOf(tab.path, links, notes, rows) },
    [center, links, notes, rows, tab.path]
  );
  const last = useRef(graph);

  if (graph !== undefined) {
    last.current = graph;
  }

  const shown = graph ?? last.current;

  const leave = useCallback(() => {
    hideGraph(tab.id);
  }, [tab.id]);

  const showMentions = useCallback(() => {
    setMentionsOpen(true);
  }, []);

  if (shown === undefined) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-background p-6">
      <NoteGraph
        center={shown.center}
        dangling={shown.dangling}
        incoming={shown.incoming}
        onHop={hopTo}
        onLeave={leave}
        onShowMentions={showMentions}
        outgoing={shown.outgoing}
      />
    </div>
  );
}
