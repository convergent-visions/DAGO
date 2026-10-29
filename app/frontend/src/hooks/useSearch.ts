import React from "react";
import type { NodeInfoProps } from "../components/leftsidebar/NodeInfo";
import type { SearchFilter, SearchOptions } from "../graph/api/search";
import { searchNodes } from "../graph/api/search";

function createFilterId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useSearch(currentGraphUUID: string | null) {
  const [filters, setFilters] = React.useState<SearchFilter[]>([]);
  const [searchOptions, setSearchOptions] = React.useState<SearchOptions>({
    matchCase: false,
    matchWords: false,
  });

  const [results, setResults] = React.useState<NodeInfoProps[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const requestVersion = React.useRef(0);

  const resetSearch = React.useCallback(() => {
    requestVersion.current += 1;
    setFilters([]);
    setResults([]);
    setError(null);
  }, []);

  const handleSearch = React.useCallback((field: string, query: string) => {
    const q = query.trim();
    if (!q) return;
    setFilters((previous) => {
      if (previous.some((filter) => filter.field === field && filter.query === q)) {
        return previous;
      }
      return [...previous, { id: createFilterId(), field, query: q }];
    });
  }, []);

  const handleRemoveFilter = React.useCallback((id: string) => {
    setFilters((previous) => previous.filter((filter) => filter.id !== id));
  }, []);

  React.useEffect(() => {
    const version = ++requestVersion.current;
    setResults([]);
    setError(null);
    if (!currentGraphUUID || filters.length === 0) return;

    void searchNodes(
      currentGraphUUID,
      filters.map(({ field, query }) => ({ field, query })),
      searchOptions
    ).then((data) => {
      if (requestVersion.current !== version) return;
      setResults(Array.isArray(data) ? data : [data]);
    }).catch((error: unknown) => {
      if (requestVersion.current !== version) return;
      setError(error instanceof Error ? error.message : "Connection error");
    });

    return () => { requestVersion.current += 1; };
  }, [currentGraphUUID, filters, searchOptions]);

  return {
    filters,
    results,
    error,
    searchOptions,
    setSearchOptions,
    handleSearch,
    handleRemoveFilter,
    setResults,
    resetSearch,
  };
}
