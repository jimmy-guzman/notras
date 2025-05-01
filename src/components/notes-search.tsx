"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

export function NotesSearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.replace(`?${params.toString()}`);
  }

  const currentKind = searchParams.get("kind") ?? "all";
  const currentQuery = searchParams.get("q") ?? "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:gap-2">
      <Select
        onValueChange={(value) => {
          updateParam("kind", value === "all" ? "" : value);
        }}
        value={currentKind}
      >
        <SelectTrigger
          aria-label="Filter by kind"
          className="text-muted-foreground w-full py-6 text-sm sm:w-34"
        >
          <SelectValue placeholder="All kinds" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All kinds</SelectItem>
          {KIND_VALUES.map((value) => {
            return (
              <SelectItem key={value} value={value}>
                {KIND_LABELS[value]}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Input
        className="py-6 text-sm sm:text-lg"
        defaultValue={currentQuery}
        onChange={(e) => {
          updateParam("q", e.target.value);
        }}
        placeholder="Search your thoughts..."
      />
    </div>
  );
}
