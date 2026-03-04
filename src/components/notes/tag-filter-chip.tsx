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
        <Badge
          className="flex cursor-pointer items-center gap-1 hover:opacity-80"
          onClick={clearTag}
          variant="secondary"
        >
          {filters.tag}
          <XIcon className="h-3 w-3" />
        </Badge>
      )}
    </div>
  );
};
