import type { Fetcher } from "swr";

import useSWR from "swr";

import type { Kind } from "@/lib/kind";

interface Note {
  content: string;
  createdAt: string;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
}

interface SearchResponse {
  notes: Note[];
  total?: number;
  totalCount?: number;
}

const notesFetcher: Fetcher<SearchResponse, string> = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json() as unknown as SearchResponse;
};

export function useNotes(kind?: string, time?: string, sort = "newest") {
  // Build query parameters
  const params = new URLSearchParams();

  if (kind && kind !== "all") params.append("kind", kind);
  if (time && time !== "all") params.append("time", time);
  if (sort !== "newest") params.append("sort", sort);

  const queryString = params.toString();
  const url = `/api/notes${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading } = useSWR<SearchResponse, Error>(
    url,
    notesFetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    error,
    isLoading,
    notes: data?.notes ?? [],
    total: data?.total ?? 0,
    totalCount: data?.totalCount ?? 0, // Total notes for user
  };
}
