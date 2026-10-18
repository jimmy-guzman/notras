import {
  Code2Icon,
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
import { Toggle } from "@/components/ui/toggle";
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

interface ViewToggleProps {
  Icon: typeof Code2Icon;
  label: string;
  onToggle: () => void;
  pressed: boolean;
}

function ViewToggle({ Icon, label, onToggle, pressed }: ViewToggleProps) {
  const chords = useChordsByName().get(label);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={label}
            onPressedChange={onToggle}
            pressed={pressed}
            size="icon-xs"
          />
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

interface NoteControlsProps {
  graphEnabled: boolean;
  onToggleGraph: () => void;
  onToggleSource: () => void;
  tab: Tab;
}

/** What the showing tab carries, then how it is viewed. Only a library note has tags, mentions or a graph. */
function NoteControls({
  graphEnabled,
  onToggleGraph,
  onToggleSource,
  tab,
}: NoteControlsProps) {
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
      <ViewToggle
        Icon={Code2Icon}
        label="markdown source"
        onToggle={onToggleSource}
        pressed={snapshot?.sourceMode ?? false}
      />
      {tab.kind === "note" ? (
        <ViewToggle
          Icon={WaypointsIcon}
          label="graph view"
          onToggle={onToggleGraph}
          pressed={graphEnabled}
        />
      ) : null}
      <Separator className="mx-1" orientation="vertical" />
    </>
  );
}

interface BarGroupProps extends Omit<NoteControlsProps, "tab"> {
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
export function BarGroup({
  activeTab,
  graphEnabled,
  onNew,
  onSearch,
  onToggleGraph,
  onToggleSource,
  ref,
}: BarGroupProps) {
  return (
    <div
      className="text-muted-foreground absolute top-0 right-0 flex h-8 items-center py-1 pe-1"
      data-tauri-drag-region="deep"
      ref={ref}
    >
      {activeTab === undefined ? null : (
        <NoteControls
          graphEnabled={graphEnabled}
          onToggleGraph={onToggleGraph}
          onToggleSource={onToggleSource}
          tab={activeTab}
        />
      )}
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
