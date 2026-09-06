import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { FileTextIcon, FolderIcon, HashIcon } from "lucide-react";
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { Hub, HubPill, RingMember } from "@/core/graph";
import { graphOf, hubKey, hubLabel, hubPill, hubRing } from "@/core/graph";
import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { noteQueries } from "@/data/queries";
import { openNote } from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { hideGraph, hopTo } from "@/lib/ui/graph";
import { setMentionsOpen } from "@/lib/ui/mentions";

import type { RingPosition } from "./layout";
import { clockwiseFrom, layoutRing, layoutRound } from "./layout";

/** Past this a side reads as a fan no longer; the rest go behind a count. */
const CAP = 12;

/** The top arc holds fewer, since its pills sit side by side. */
const TOP_CAP = 5;

const CENTRE: RingPosition = { angle: Number.NaN, x: 0.5, y: 0.5 };

const PILL_CLASS =
  "-translate-x-1/2 -translate-y-1/2 absolute max-w-48 bg-background outline-none transition-[left,top] duration-150 ease-out hover:text-foreground focus-visible:text-foreground";

const MENU_CLASS =
  "w-72 border border-border shadow-[0_8px_24px_rgb(0_0_0/0.18)] ring-0";

export type Picture =
  | {
      dangling: string[];
      hubs: HubPill[];
      incoming: Mention[];
      kind: "note";
      note: NoteMeta;
      outgoing: Mention[];
    }
  | { hub: HubPill; kind: "hub"; members: RingMember[] };

type Step = -1 | 1;

/** What every pill on the ring answers to: arrows walk, esc leaves. */
interface RingKeys {
  onLeave: () => void;
  onWalk: (from: string, step: Step) => void;
}

type PillRef = (key: string, element: HTMLButtonElement | null) => void;

type Overflow =
  | { dangling: string[]; kind: "links"; outgoing: Mention[] }
  | { kind: "members"; members: RingMember[] }
  | { kind: "mentions" };

type Item =
  | { both: boolean; kind: "note"; note: NoteMeta; position: RingPosition }
  | { kind: "hub"; pill: HubPill; position: RingPosition }
  | { kind: "placeholder"; position: RingPosition; target: string }
  | {
      count: number;
      id: string;
      kind: "overflow";
      more: Overflow;
      position: RingPosition;
    };

function keyOf(item: Item) {
  switch (item.kind) {
    case "note":
      return item.note.path;
    case "hub":
      return hubKey(item.pill.hub);
    case "placeholder":
      return `dangling:${item.target}`;
    case "overflow":
      return item.id;
    default:
      return "";
  }
}

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

function leading<T>(all: T[], cap: number) {
  return all.length <= cap
    ? { hidden: 0, shown: all }
    : { hidden: all.length - (cap - 1), shown: all.slice(0, cap - 1) };
}

function place<T>(
  side: T[],
  slots: RingPosition[],
  item: (entry: T, position: RingPosition) => Item
) {
  return side.flatMap((entry, index) => {
    const position = slots[index];

    return position === undefined ? [] : [item(entry, position)];
  });
}

function memberItem(member: RingMember, position: RingPosition): Item {
  return member.kind === "note"
    ? { both: false, kind: "note", note: member.note, position }
    : { kind: "hub", pill: member.pill, position };
}

function itemsOf(picture: Picture): Item[] {
  if (picture.kind === "hub") {
    const { hidden, shown } = leading(picture.members, CAP);
    const slots = layoutRound(shown.length + (hidden > 0 ? 1 : 0));
    const last = slots.at(-1);

    return [
      { kind: "hub", pill: picture.hub, position: CENTRE },
      ...place(shown, slots, memberItem),
      ...(hidden > 0 && last !== undefined
        ? [
            {
              count: hidden,
              id: "overflow:members",
              kind: "overflow" as const,
              more: { kind: "members" as const, members: picture.members },
              position: last,
            },
          ]
        : []),
    ];
  }

  const { dangling, hubs, incoming, note, outgoing } = picture;
  const linked = new Set(outgoing.map((mention) => mention.note.path));
  const mentioned = new Set(incoming.map((mention) => mention.note.path));
  const left = capped(
    incoming
      .map((mention) => mention.note)
      .filter((entry) => !linked.has(entry.path))
  );
  // Real links first, then what room the cap leaves for placeholders.
  const right = capped(outgoing.map((mention) => mention.note));
  const room = Math.max(
    0,
    CAP - right.shown.length - (right.hidden > 0 ? 1 : 0)
  );
  const shownDangling = dangling.slice(0, room);
  const hiddenRight = right.hidden + (dangling.length - shownDangling.length);
  const top = leading(hubs, TOP_CAP);
  const ring = layoutRing(
    left.shown.length + (left.hidden > 0 ? 1 : 0),
    right.shown.length + shownDangling.length + (hiddenRight > 0 ? 1 : 0),
    top.shown.length + (top.hidden > 0 ? 1 : 0)
  );
  const noteItem = (entry: NoteMeta, position: RingPosition): Item => ({
    both: linked.has(entry.path) && mentioned.has(entry.path),
    kind: "note",
    note: entry,
    position,
  });
  const overflowIn = ring.incoming.at(-1);
  const overflowOut = ring.outgoing.at(-1);
  const overflowTop = ring.top.at(-1);

  return [
    { both: false, kind: "note", note, position: CENTRE },
    ...place(left.shown, ring.incoming, noteItem),
    ...(left.hidden > 0 && overflowIn !== undefined
      ? [
          {
            count: left.hidden,
            id: "overflow:in",
            kind: "overflow" as const,
            more: { kind: "mentions" as const },
            position: overflowIn,
          },
        ]
      : []),
    ...place(right.shown, ring.outgoing, noteItem),
    ...place(
      shownDangling,
      ring.outgoing.slice(right.shown.length),
      (target, position): Item => ({ kind: "placeholder", position, target })
    ),
    ...(hiddenRight > 0 && overflowOut !== undefined
      ? [
          {
            count: hiddenRight,
            id: "overflow:out",
            kind: "overflow" as const,
            more: { dangling, kind: "links" as const, outgoing },
            position: overflowOut,
          },
        ]
      : []),
    ...place(
      top.shown,
      ring.top,
      (pill, position): Item => ({ kind: "hub", pill, position })
    ),
    ...(top.hidden > 0 && overflowTop !== undefined
      ? [
          {
            count: top.hidden,
            id: "overflow:top",
            kind: "overflow" as const,
            more: {
              kind: "members" as const,
              members: hubs.map((pill) => ({ kind: "hub" as const, pill })),
            },
            position: overflowTop,
          },
        ]
      : []),
  ];
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

function HubFace({ pill }: { pill: HubPill }) {
  return (
    <>
      {pill.hub.kind === "folder" ? <FolderIcon /> : null}
      <span className="truncate">{hubLabel(pill.hub)}</span>
      <span className="text-faint tabular-nums">{pill.count}</span>
    </>
  );
}

interface PillProps {
  centre: boolean;
  item: Item & { kind: "hub" | "note" };
  keys: RingKeys;
  onHop: (path: string, beside: boolean) => void;
  onHub: (hub: Hub) => void;
  onLive: (key: string | null) => void;
  pillRef: PillRef;
}

function Pill({
  centre,
  item,
  keys,
  onHop,
  onHub,
  onLive,
  pillRef,
}: PillProps) {
  const key = keyOf(item);

  const attach = useCallback(
    (element: HTMLButtonElement | null) => {
      pillRef(key, element);
    },
    [key, pillRef]
  );

  const go = useCallback(
    (beside: boolean) => {
      if (centre) {
        keys.onLeave();
      } else if (item.kind === "note") {
        onHop(item.note.path, beside);
      } else {
        onHub(item.pill.hub);
      }
    },
    [centre, item, keys, onHop, onHub]
  );

  const click = useCallback(
    (event: MouseEvent) => {
      go(event.metaKey);
    },
    [go]
  );

  // A native button turns ⏎ into a click, but that click carries no modifier.
  const keyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.metaKey) {
        event.preventDefault();
        go(true);
      } else {
        ringKeyDown(event, key, keys);
      }
    },
    [go, key, keys]
  );

  const live = useCallback(() => {
    onLive(key);
  }, [key, onLive]);

  const idle = useCallback(() => {
    onLive(null);
  }, [onLive]);

  return (
    <Badge
      className={cn(
        PILL_CLASS,
        centre ? "h-7 px-3 text-foreground text-sm" : "text-muted-foreground"
      )}
      onBlur={idle}
      onClick={click}
      onFocus={live}
      onKeyDown={keyDown}
      onMouseEnter={live}
      onMouseLeave={idle}
      render={<button ref={attach} type="button" />}
      style={pillStyle(item.position)}
      variant="ghost"
    >
      {item.kind === "note" ? (
        <span className="truncate">{item.note.title}</span>
      ) : (
        <HubFace pill={item.pill} />
      )}
    </Badge>
  );
}

/** A link that names no note: shown, since the note may yet be written, and opening nothing. */
function Placeholder({
  position,
  target,
}: {
  position: RingPosition;
  target: string;
}) {
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

function NoteRow({ note }: { note: NoteMeta }) {
  const open = useCallback(
    (event: MouseEvent) => {
      openNote(note.path, event.metaKey);
    },
    [note.path]
  );

  return (
    <DropdownMenuItem onClick={open}>
      <FileTextIcon />
      <span className="truncate">
        {note.title}
        {note.folder === "" ? null : (
          <span className="text-muted-foreground text-xs">
            {" "}
            · {note.folder}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}

function HubRow({ onHub, pill }: { onHub: (hub: Hub) => void; pill: HubPill }) {
  const go = useCallback(() => {
    onHub(pill.hub);
  }, [onHub, pill.hub]);

  return (
    <DropdownMenuItem onClick={go}>
      {pill.hub.kind === "folder" ? <FolderIcon /> : <HashIcon />}
      <span className="truncate">
        {pill.hub.kind === "folder" ? pill.hub.folder : pill.hub.tag}
      </span>
      <span className="ml-auto text-faint tabular-nums">{pill.count}</span>
    </DropdownMenuItem>
  );
}

interface OverflowPillProps {
  item: Item & { kind: "overflow" };
  keys: RingKeys;
  onHub: (hub: Hub) => void;
  onShowMentions: () => void;
  pillRef: PillRef;
}

function OverflowPill({
  item,
  keys,
  onHub,
  onShowMentions,
  pillRef,
}: OverflowPillProps) {
  const attach = useCallback(
    (element: HTMLButtonElement | null) => {
      pillRef(item.id, element);
    },
    [item.id, pillRef]
  );

  const keyDown = useCallback(
    (event: KeyboardEvent) => {
      ringKeyDown(event, item.id, keys);
    },
    [item.id, keys]
  );

  const pill = (
    <Badge
      className={cn(PILL_CLASS, "text-muted-foreground tabular-nums")}
      onClick={item.more.kind === "mentions" ? onShowMentions : undefined}
      onKeyDown={keyDown}
      render={<button ref={attach} type="button" />}
      style={pillStyle(item.position)}
      variant="ghost"
    >
      +{item.count}
    </Badge>
  );

  if (item.more.kind === "mentions") {
    return pill;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start" className={MENU_CLASS} side="bottom">
        {item.more.kind === "links"
          ? [
              ...item.more.outgoing.map((mention) => (
                <MentionItem key={mention.note.path} mention={mention} />
              )),
              ...item.more.dangling.map((target) => (
                <DropdownMenuItem
                  className="text-faint"
                  disabled
                  key={`dangling:${target}`}
                >
                  <span className="truncate">{target}</span>
                </DropdownMenuItem>
              )),
            ]
          : item.more.members.map((member) =>
              member.kind === "note" ? (
                <NoteRow key={member.note.path} note={member.note} />
              ) : (
                <HubRow
                  key={hubKey(member.pill.hub)}
                  onHub={onHub}
                  pill={member.pill}
                />
              )
            )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NoteGraphProps {
  onHop: (path: string, beside: boolean) => void;
  onHub: (hub: Hub) => void;
  onLeave: () => void;
  onShowMentions: () => void;
  picture: Picture;
}

/**
 * Pills are keyed by what they stand for and placed by percentage, so a note
 * or a hub on screen before and after a hop is one element gliding to its new
 * place rather than two.
 */
export function NoteGraph({
  onHop,
  onHub,
  onLeave,
  onShowMentions,
  picture,
}: NoteGraphProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pills = useRef(new Map<string, HTMLButtonElement>());
  const size = useStageSize(stageRef);
  const [live, setLive] = useState<string | null>(null);

  const items = useMemo(() => itemsOf(picture), [picture]);
  const centreKey = keyOf(
    items[0] ?? { kind: "placeholder", position: CENTRE, target: "" }
  );
  const ring = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.kind !== "placeholder" && !Number.isNaN(item.position.angle)
        )
        .map((item) => ({ angle: item.position.angle, key: keyOf(item) }))
        .toSorted((a, b) => clockwiseFrom(a.angle) - clockwiseFrom(b.angle)),
    [items]
  );

  const pillRef = useCallback<PillRef>((key, element) => {
    if (element === null) {
      pills.current.delete(key);
    } else {
      pills.current.set(key, element);
    }
  }, []);

  // Landing, whether by toggle or by hop, puts the hand on the centre.
  useEffect(() => {
    pills.current.get(centreKey)?.focus();
  }, [centreKey]);

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

  const lone = items.length === 1;

  return (
    <div className="relative h-full w-full select-none" ref={stageRef}>
      {lone || picture.kind === "hub" ? null : (
        <>
          <span className="absolute top-[6%] left-[12%] -translate-x-1/2 text-faint text-xs">
            mentions
          </span>
          <span className="absolute top-[6%] left-[88%] -translate-x-1/2 text-faint text-xs">
            links
          </span>
        </>
      )}
      {items
        .filter((item) => !Number.isNaN(item.position.angle))
        .map((item) => (
          <Hairline
            both={item.kind === "note" && item.both}
            dashed={item.kind === "placeholder"}
            key={keyOf(item)}
            live={live === keyOf(item)}
            position={item.position}
            size={size}
          />
        ))}
      {items.map((item) => {
        switch (item.kind) {
          case "placeholder":
            return (
              <Placeholder
                key={keyOf(item)}
                position={item.position}
                target={item.target}
              />
            );
          case "overflow":
            return (
              <OverflowPill
                item={item}
                key={item.id}
                keys={keys}
                onHub={onHub}
                onShowMentions={onShowMentions}
                pillRef={pillRef}
              />
            );
          default:
            return (
              <Pill
                centre={keyOf(item) === centreKey}
                item={item}
                key={keyOf(item)}
                keys={keys}
                onHop={onHop}
                onHub={onHub}
                onLive={setLive}
                pillRef={pillRef}
              />
            );
        }
      })}
      {lone ? (
        <p className="absolute top-[calc(50%+2rem)] left-1/2 -translate-x-1/2 whitespace-nowrap text-faint text-xs">
          {picture.kind === "hub"
            ? "nothing here yet"
            : "no links yet, and nothing mentions it"}
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
  const [hubState, setHubState] = useState<{
    forPath: string;
    hub: Hub;
  } | null>(null);
  const hub = hubState?.forPath === tab.path ? hubState.hub : null;
  // The path rather than a flag: this component outlives a hop on purpose,
  // so a once-per-mount guard would silence every note after the first.
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (
      bare.error !== null &&
      bare.data === undefined &&
      reported.current !== tab.path
    ) {
      reported.current = tab.path;
      toast.add({
        description: reasonOf(bare.error),
        title: "could not read the graph",
        type: "error",
      });
    }
  }, [bare.data, bare.error, tab.path]);

  // A failed read of the bare mentions leaves the links, which are already
  // here; a blank pane over a hidden editor would say less than the toast.
  const rows = bare.data ?? (bare.error === null ? undefined : []);
  const picture = useMemo<Picture | undefined>(() => {
    if (hub !== null) {
      return {
        hub: hubPill(hub, notes),
        kind: "hub",
        members: hubRing(hub, notes),
      };
    }

    return center === undefined || rows === undefined
      ? undefined
      : {
          kind: "note",
          note: center,
          ...graphOf(tab.path, links, notes, rows),
        };
  }, [center, hub, links, notes, rows, tab.path]);
  const last = useRef(picture);

  useEffect(() => {
    if (picture !== undefined) {
      last.current = picture;
    }
  }, [picture]);

  const shown = picture ?? last.current;

  const hop = useCallback((path: string, beside: boolean) => {
    setHubState(null);
    hopTo(path, beside);
  }, []);

  const toHub = useCallback(
    (next: Hub) => {
      setHubState({ forPath: tab.path, hub: next });
    },
    [tab.path]
  );

  const leave = useCallback(() => {
    if (hub === null) {
      hideGraph(tab.id);
    } else {
      setHubState(null);
    }
  }, [hub, tab.id]);

  const showMentions = useCallback(() => {
    setMentionsOpen(true);
  }, []);

  if (shown === undefined) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-background p-6">
      <NoteGraph
        onHop={hop}
        onHub={toHub}
        onLeave={leave}
        onShowMentions={showMentions}
        picture={shown}
      />
    </div>
  );
}
