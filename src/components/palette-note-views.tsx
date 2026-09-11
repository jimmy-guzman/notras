import { useQuery } from "@tanstack/react-query";
import {
  FolderIcon,
  FolderInputIcon,
  HashIcon,
  PencilIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback } from "react";
import { useNoteTags } from "@/components/notes/use-note-tags";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { filenameFromTitle } from "@/core/notes";
import { searchFolders } from "@/core/search";
import { noteQueries } from "@/data/queries";
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
  const toggle = useCallback(() => {
    onToggle(name);
  }, [name, onToggle]);

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
  const retry = useCallback(async () => {
    await notes.refetch();
  }, [notes]);
  if (notes.data === undefined) {
    return (
      <div className="p-4 text-sm" role="status">
        {notes.isError ? (
          <>
            <p>could not load folders</p>
            <p>{reasonOf(notes.error)}</p>
            <Button onClick={retry} size="sm" variant="ghost">
              retry
            </Button>
          </>
        ) : (
          "loading folders..."
        )}
      </div>
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
  const { changeTags } = useNoteTags(path, attached);
  const counts = new Map(
    vocabulary.data?.map(({ count, tag }) => [tag, count])
  );
  const draftTag = query.trim().toLowerCase();
  const choices = [...new Set([...counts.keys(), ...attached])]
    .toSorted()
    .filter((name) => name.includes(draftTag));
  const toggle = useCallback(
    async (name: string) => {
      await changeTags((current) =>
        current.includes(name)
          ? current.filter((tag) => tag !== name)
          : [...current, name]
      );
    },
    [changeTags]
  );
  const add = useCallback(async () => {
    onQueryChange("");
    await changeTags((current) => [...current, draftTag]);
  }, [changeTags, draftTag, onQueryChange]);
  const retry = useCallback(async () => {
    await vocabulary.refetch();
  }, [vocabulary]);
  return (
    <>
      {vocabulary.isPending ? (
        <p className="p-4 text-muted-foreground text-sm" role="status">
          loading tag suggestions...
        </p>
      ) : null}
      {vocabulary.isError ? (
        <div className="p-4 text-sm" role="status">
          <p>could not load tag suggestions</p>
          <p>{reasonOf(vocabulary.error)}</p>
          <Button onClick={retry} size="sm" variant="ghost">
            retry
          </Button>
        </div>
      ) : null}
      <CommandGroup heading={`tags for "${title}"`}>
        {choices.map((name) => (
          <TagChoiceItem
            attached={attached.includes(name)}
            count={
              vocabulary.data === undefined
                ? undefined
                : (counts.get(name) ?? 0)
            }
            key={name}
            name={name}
            onToggle={toggle}
          />
        ))}
        {draftTag === "" || choices.includes(draftTag) ? null : (
          <CommandItem onSelect={add} value="tag-new">
            <TagPlusIcon />
            add "{draftTag}"
          </CommandItem>
        )}
        <CommandItem onSelect={onDone} value="cancel-tags">
          done
        </CommandItem>
      </CommandGroup>
    </>
  );
}
