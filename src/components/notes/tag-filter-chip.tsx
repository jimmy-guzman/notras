"use client";

import { XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";

import { Badge } from "@/components/ui/badge";
import { parsers } from "@/lib/notes-search-params";

interface TagFilterChipProps {
  totalCount: number;
}

export const TagFilterChip = ({ totalCount }: TagFilterChipProps) => {
  const [filters, setFilters] = useQueryStates(parsers, { shallow: false });

  const clearTag = async () => {
    await setFilters({ tag: "" });
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
    </div>
  );
};
