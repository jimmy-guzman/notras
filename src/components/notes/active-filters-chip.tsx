"use client";

import { XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";

import type { FolderWithCount } from "@/server/repositories/folder-repository";

import { Badge } from "@/components/ui/badge";
import { parsers } from "@/lib/notes-search-params";

interface ActiveFiltersChipProps {
  activeFolder: FolderWithCount | undefined;
  totalCount: number;
}

export const ActiveFiltersChip = ({
  activeFolder,
  totalCount,
}: ActiveFiltersChipProps) => {
  const [filters, setFilters] = useQueryStates(parsers, { shallow: false });

  const clearTag = async () => {
    await setFilters({ tag: "" });
  };

  const clearFolder = async () => {
    await setFilters({ folder: "" });
  };

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-muted-foreground">
        found {totalCount} {totalCount === 1 ? "note" : "notes"}
      </p>
      {filters.tag && (
        <button
          aria-label={`clear tag filter: ${filters.tag}`}
          className="flex items-center gap-1"
          onClick={clearTag}
          type="button"
        >
          <Badge
            className="flex items-center gap-1 hover:opacity-80"
            variant="secondary"
          >
            {filters.tag}
            <XIcon className="h-3 w-3" />
          </Badge>
        </button>
      )}
      {filters.folder && activeFolder && (
        <button
          aria-label={`clear folder filter: ${activeFolder.name}`}
          className="flex items-center gap-1"
          onClick={clearFolder}
          type="button"
        >
          <Badge
            className="flex items-center gap-1 hover:opacity-80"
            variant="secondary"
          >
            {activeFolder.name}
            <XIcon className="h-3 w-3" />
          </Badge>
        </button>
      )}
    </div>
  );
};
