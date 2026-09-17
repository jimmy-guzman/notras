import { useQuery } from "@tanstack/react-query";
import {
  FolderIcon,
  FolderInputIcon,
  HashIcon,
  PencilIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { toast } from "@/components/ui/toast";
import { filenameFromTitle } from "@/core/notes";
import { searchFolders } from "@/core/search";
import { noteQueries } from "@/data/queries";
import { changeNoteMetadata } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";

const COUNT_CLASS =
  "w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums";

interface FolderItemProps {
  count: number;
  folder: string;
  onMove: (folder: string) => void;
}

function FolderItem({ count, folder, onMove }: FolderItemProps) {
  const label = folder === "/" ? "notes root" : folder;
  const move = () => {
    onMove(folder === "/" ? "" : folder);
  };

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
  count: number | undefined;
  name: string;
  onToggle: (name: string) => void;
}

function TagChoiceItem({
  attached,
  count,
  name,
  onToggle,
}: TagChoiceItemProps) {
  const toggle = () => {
    onToggle(name);
  };

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
    <CommandGroup heading={`delete "${title}"?`} variant="title">
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
  onCancel: () => void;
  onMove: (folder: string) => void;
  onMoveToNewFolder: () => void;
  query: string;
}

export function MoveView({
  onCancel,
  onMove,
  onMoveToNewFolder,
  query,
}: MoveViewProps) {
  const notes = useQuery(noteQueries.list());
  const retry = async () => {
    await notes.refetch();
  };
  if (notes.data === undefined) {
    return (
      <output className="block p-4 text-sm">
        {notes.isError ? (
          <>
            <span className="block">could not load folders</span>
            <span className="block">{reasonOf(notes.error)}</span>
            <Button
              onClick={() => {
                void retry();
              }}
              size="sm"
              variant="ghost"
            >
              retry
            </Button>
          </>
        ) : (
          "loading folders..."
        )}
      </output>
    );
  }
  const folders = searchFolders(notes.data);
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
          new folder &quot;{draftFolder}&quot;
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
    <CommandGroup heading={`rename "${title}"`} variant="title">
      {draftTitle === "" ? null : (
        <CommandItem onSelect={onConfirm} value="confirm-rename">
          <PencilIcon />
          <span className="truncate">rename to &quot;{draftTitle}&quot;</span>
          <span className="text-muted-foreground truncate text-xs">
            {filenameFromTitle(draftTitle)}.md
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
  onDone: () => void;
  onQueryChange: (query: string) => void;
  path: string;
  query: string;
  title: string;
}

export function TagsView({
  attached,
  onDone,
  onQueryChange,
  path,
  query,
  title,
}: TagsViewProps) {
  const vocabulary = useQuery(noteQueries.tags());
  const counts = new Map(
    vocabulary.data?.map(({ count, tag }) => [tag, count])
  );
  const draftTag = query.trim().toLowerCase();
  const choices = [...new Set([...counts.keys(), ...attached])]
    .toSorted()
    .filter((name) => name.includes(draftTag));
  const toggle = async (name: string) => {
    try {
      await changeNoteMetadata(path, {
        tags: (current) =>
          current.includes(name)
            ? current.filter((tag) => tag !== name)
            : [...current, name],
      });
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update tags",
        type: "error",
      });
    }
  };
  const add = async () => {
    onQueryChange("");
    try {
      await changeNoteMetadata(path, {
        tags: (current) => [...current, draftTag],
      });
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update tags",
        type: "error",
      });
    }
  };
  const retry = async () => {
    await vocabulary.refetch();
  };
  const attachedNames = new Set(attached);

  return (
    <>
      {vocabulary.isPending ? (
        <output className="text-muted-foreground block p-4 text-sm">
          loading tag suggestions...
        </output>
      ) : null}
      {vocabulary.isError ? (
        <output className="block p-4 text-sm">
          <span className="block">could not load tag suggestions</span>
          <span className="block">{reasonOf(vocabulary.error)}</span>
          <Button
            onClick={() => {
              void retry();
            }}
            size="sm"
            variant="ghost"
          >
            retry
          </Button>
        </output>
      ) : null}
      <CommandGroup heading={`tags for "${title}"`} variant="title">
        {choices.map((name) => (
          <TagChoiceItem
            attached={attachedNames.has(name)}
            count={
              vocabulary.data === undefined
                ? undefined
                : (counts.get(name) ?? 0)
            }
            key={name}
            name={name}
            onToggle={(tag) => {
              void toggle(tag);
            }}
          />
        ))}
        {draftTag === "" || choices.includes(draftTag) ? null : (
          <CommandItem
            onSelect={() => {
              void add();
            }}
            value="tag-new"
          >
            <TagPlusIcon />
            add &quot;{draftTag}&quot;
          </CommandItem>
        )}
        <CommandItem onSelect={onDone} value="cancel-tags">
          done
        </CommandItem>
      </CommandGroup>
    </>
  );
}
