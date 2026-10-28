import {
  Code2Icon,
  FileTextIcon,
  PanelRightIcon,
  PlusIcon,
  SearchIcon,
  WaypointsIcon,
} from "lucide-react";
import type { Ref } from "react";

import { BarButton } from "@/components/bar-button";
import { Chord } from "@/components/chord";
import { MentionsOf } from "@/components/notes/note-mentions";
import { NoteTags } from "@/components/notes/note-tags";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTabSnapshot } from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { toggleNoteBrowser } from "@/lib/ui/note-browser";
import { useChordsByName } from "@/lib/ui/shortcuts";
import { showView, useTabView } from "@/lib/ui/view";
import type { TabView } from "@/lib/ui/view";

interface ViewItemProps {
  Icon: typeof Code2Icon;
  label: string;
  view: TabView;
}

function ViewItem({ Icon, label, view }: ViewItemProps) {
  const chords = useChordsByName().get(label);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ToggleGroupItem aria-label={label} size="icon-xs" value={view} />
        }
      >
        <Icon className={BAR_GLYPH} />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {chords?.map(({ hotkey, id }) => (
          <Chord hotkey={hotkey} key={id} />
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/** The views a tab has, one lit. Picking an item shows its view; the chords are what toggle back. */
function ViewPicker({ tab }: { tab: Tab }) {
  const view = useTabView(tab.id);

  return (
    <ToggleGroup
      aria-label="view"
      onValueChange={([picked]) => {
        // Base UI reports a click on the lit item as an empty value. The picker is a choice of one, so that click keeps the view.
        if (picked !== undefined) {
          showView(tab.id, picked);
        }
      }}
      spacing={0}
      value={[view]}
    >
      <ViewItem Icon={FileTextIcon} label="note" view="note" />
      <ViewItem Icon={Code2Icon} label="markdown source" view="source" />
      {tab.kind === "note" ? (
        <ViewItem Icon={WaypointsIcon} label="graph view" view="graph" />
      ) : null}
    </ToggleGroup>
  );
}

/** What the showing tab carries, then how it is viewed. Only a library note has tags, mentions or a graph. */
function NoteControls({ tab }: { tab: Tab }) {
  const snapshot = useTabSnapshot(tab.id);

  return (
    <>
      {tab.kind === "note" ? (
        <>
          <NoteTags path={tab.path} tags={snapshot?.tags ?? []} />
          {/* Keyed so a tab switch closes the previous note's mentions list. */}
          <MentionsOf key={tab.path} path={tab.path} />
          <Separator className="mx-1" orientation="vertical" />
        </>
      ) : null}
      <ViewPicker tab={tab} />
      <Separator className="mx-1" orientation="vertical" />
    </>
  );
}

interface BarGroupProps {
  activeTab: Tab | undefined;
  onNew: () => void;
  onSearch: () => void;
  ref: Ref<HTMLDivElement>;
}

/**
 * The bar's controls, pinned to the window's top right whether or not the
 * browser is open, so the button that toggles it never moves under the
 * pointer. The note's controls lead; the app's follow.
 */
export function BarGroup({ activeTab, onNew, onSearch, ref }: BarGroupProps) {
  return (
    <div
      className="text-muted-foreground absolute top-0 right-0 flex h-8 items-center py-1 pe-1"
      data-tauri-drag-region="deep"
      ref={ref}
    >
      {activeTab === undefined ? null : <NoteControls tab={activeTab} />}
      <BarButton Icon={PlusIcon} label="new note" onClick={onNew} />
      <BarButton Icon={SearchIcon} label="find a note" onClick={onSearch} />
      <BarButton
        Icon={PanelRightIcon}
        label="browse notes"
        onClick={toggleNoteBrowser}
      />
    </div>
  );
}
