import {
  FolderIcon,
  FolderInputIcon,
  HashIcon,
  PencilIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { filenameFromTitle } from "@/core/notes";

const COUNT_CLASS =
  "w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums";

interface FolderItemProps {
  count: number;
  folder: string;
  onMove: (folder: string) => void;
}

function FolderItem({ count, folder, onMove }: FolderItemProps) {
  const label = folder === "/" ? "notes root" : folder;
  const move = useCallback(() => {
    onMove(folder === "/" ? "" : folder);
  }, [folder, onMove]);

  return (
    <CommandItem onSelect={move} value={`move-${folder}`}>
      <FolderIcon />
      <span className="flex-1 truncate">{label}</span>
      <span className={COUNT_CLASS}>{count}</span>
    </CommandItem>
  );
}

interface TagChoiceItemProps {
  attached: boolean;
  count: number;
  name: string;
  onToggle: (name: string, attached: boolean) => void;
}

function TagChoiceItem({
  attached,
  count,
  name,
  onToggle,
}: TagChoiceItemProps) {
  const toggle = useCallback(() => {
    onToggle(name, attached);
  }, [attached, name, onToggle]);

  return (
    <CommandItem
      aria-checked={attached}
      data-checked={attached}
      onSelect={toggle}
      value={`tag-${name}`}
    >
      <HashIcon />
      <span className="flex-1 truncate">{name}</span>
      <span className={COUNT_CLASS}>{count}</span>
    </CommandItem>
  );
}

interface DeleteViewProps {
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

export function DeleteView({ onCancel, onConfirm, title }: DeleteViewProps) {
  return (
    <CommandGroup heading={`delete "${title}"?`}>
      <CommandItem onSelect={onCancel} value="cancel-delete">
        cancel
      </CommandItem>
      <CommandItem onSelect={onConfirm} value="confirm-delete">
        <Trash2Icon className="text-destructive" />
        delete forever
      </CommandItem>
    </CommandGroup>
  );
}

interface MoveViewProps {
  folders: { count: number; folder: string }[];
  onCancel: () => void;
  onMove: (folder: string) => void;
  onMoveToNewFolder: () => void;
  query: string;
}

export function MoveView({
  folders,
  onCancel,
  onMove,
  onMoveToNewFolder,
  query,
}: MoveViewProps) {
  const draftFolder = query.trim();
  const matches = folders.filter(({ folder }) =>
    (folder === "/" ? "notes root /" : folder)
      .toLowerCase()
      .includes(draftFolder.toLowerCase())
  );
  const exists =
    folders.some(
      ({ folder }) => folder.toLowerCase() === draftFolder.toLowerCase()
    ) || draftFolder.toLowerCase() === "notes root";

  return (
    <CommandGroup heading="move to">
      {matches.map(({ count, folder }) => (
        <FolderItem
          count={count}
          folder={folder}
          key={folder}
          onMove={onMove}
        />
      ))}
      {draftFolder === "" || exists ? null : (
        <CommandItem onSelect={onMoveToNewFolder} value="move-new">
          <FolderInputIcon />
          new folder "{draftFolder}"
        </CommandItem>
      )}
      <CommandItem onSelect={onCancel} value="cancel-move">
        cancel
      </CommandItem>
    </CommandGroup>
  );
}

interface RenameViewProps {
  onCancel: () => void;
  onConfirm: () => void;
  query: string;
  title: string;
}

export function RenameView({
  onCancel,
  onConfirm,
  query,
  title,
}: RenameViewProps) {
  const draftTitle = query.trim();

  return (
    <CommandGroup heading={`rename "${title}"`}>
      {draftTitle === "" ? null : (
        <CommandItem onSelect={onConfirm} value="confirm-rename">
          <PencilIcon />
          <span className="truncate">
            rename to "{draftTitle}"
            <span className="text-muted-foreground">
              {" · "}
              {filenameFromTitle(draftTitle)}.md
            </span>
          </span>
        </CommandItem>
      )}
      <CommandItem onSelect={onCancel} value="cancel-rename">
        cancel
      </CommandItem>
    </CommandGroup>
  );
}

interface TagsViewProps {
  attached: string[];
  choices: string[];
  counts: Map<string, number>;
  draftTag: string;
  onCreate: () => void;
  onDone: () => void;
  onToggle: (name: string, attached: boolean) => void;
  title: string;
}

export function TagsView({
  attached,
  choices,
  counts,
  draftTag,
  onCreate,
  onDone,
  onToggle,
  title,
}: TagsViewProps) {
  return (
    <CommandGroup heading={`tags for "${title}"`}>
      {choices.map((name) => (
        <TagChoiceItem
          attached={attached.includes(name)}
          count={counts.get(name) ?? 0}
          key={name}
          name={name}
          onToggle={onToggle}
        />
      ))}
      {draftTag === "" || choices.includes(draftTag) ? null : (
        <CommandItem onSelect={onCreate} value="tag-new">
          <TagPlusIcon />
          create "{draftTag}"
        </CommandItem>
      )}
      <CommandItem onSelect={onDone} value="cancel-tags">
        done
      </CommandItem>
    </CommandGroup>
  );
}
