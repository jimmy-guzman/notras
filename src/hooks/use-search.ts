import type { Fetcher } from "swr";

import useSWR from "swr";

import type { SelectNote } from "@/server/db/schemas/notes";

interface FilterState {
  label?: string;
  type: "home" | "kind" | "time";
  value?: string;
}

const buildSearchParams = (query: string, filter: FilterState) => {
  const params = new URLSearchParams({
    kind: "all",
    q: "",
    sort: "newest",
    time: "all",
  });

  if (filter.value) {
    switch (filter.type) {
      case "home": {
        break;
      }
      case "kind": {
        params.set("kind", filter.value);

        break;
      }
      case "time": {
        params.set("time", filter.value);

        break;
      }
      default: {
        break;
      }
    }
  }

  if (query.trim()) {
    params.set("q", query.trim());
  }

  return params;
};

const shouldFetchData = (query: string, filter: FilterState): boolean => {
  if (filter.type === "home" && !query.trim() && !filter.value) {
    return false;
  }

  return true;
};

const searchFetcher: Fetcher<SearchResponse, string> = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json() as unknown as SearchResponse;
};

interface SearchResponse {
  notes: SelectNote[];
}

const DEDUPING_INTERVAL = 2000;

export function useSearch(query: string, currentFilter: FilterState) {
  const shouldFetch = shouldFetchData(query, currentFilter);
  const searchParams = buildSearchParams(query, currentFilter);

  const { data, error, isLoading } = useSWR<SearchResponse, Error>(
    shouldFetch ? `/api/notes?${searchParams.toString()}` : null,
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
