import type { Fetcher } from "swr";

import useSWR from "swr";

import type { Kind } from "@/lib/kind";

interface FilterState {
  label?: string;
  type: "home" | "kind" | "time";
  value?: string;
}

const buildSearchQuery = (query: string, filter: FilterState): string => {
  // If user has typed something, prioritize their input
  if (query.trim()) {
    return query;
  }

  // If no user input but we have an active filter, build filter query
  if (filter.value) {
    switch (filter.type) {
      case "kind": {
        return `kind ${filter.value}`; // Space, not colon - matches API regex
      }
      case "time": {
        return filter.value; // Just the time value - matches API array check
      }
      default: {
        return "";
      }
    }
  }

  return "";
};

const shouldFetchData = (query: string, filter: FilterState): boolean => {
  const searchQuery = buildSearchQuery(query, filter);

  // Don't fetch if we're on home with no search query or active filter
  if (filter.type === "home" && !searchQuery.trim()) {
    return false;
  }

  // Only fetch if we have something to search for
  return searchQuery.trim().length > 0;
};
const searchFetcher: Fetcher<SearchResponse, string> = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json() as unknown as SearchResponse;
};

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
}

const DEDUPING_INTERVAL = 2000;

export function useSearch(query: string, currentFilter: FilterState) {
  const searchQuery = buildSearchQuery(query, currentFilter);
  const shouldFetch = shouldFetchData(query, currentFilter);

  const { data, error, isLoading } = useSWR<SearchResponse, Error>(
    shouldFetch ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    searchFetcher,
    {
      dedupingInterval: DEDUPING_INTERVAL,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  return {
    error,
    isLoading,
    notes: data?.notes ?? [],
  };
}
