import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import {
  searchFoods,
  type FoodCandidate,
  type SavedFood,
  type SourceStatus,
} from "../../api/food";

const WAIT_MS = 300; // after the last key press, before searching
const MIN_LETTERS = 2;

export type FoodSearch = {
  query: string;
  setQuery: (text: string) => void;
  saved: SavedFood[];
  results: FoodCandidate[];
  /** Plain sentences about a database that was down (the other results are still good). */
  warnings: string[];
  loading: boolean;
  /** The first results are showing; a slower database is still being asked for more. */
  extending: boolean;
  error: string | null;
  hasMore: boolean;
  /** Fetch the next page and add it to the list. */
  loadMore: () => void;
  /** True once a search has finished for the current words. */
  searched: boolean;
};

function warningsFrom(sources: SourceStatus[]): string[] {
  return sources
    .filter((s) => !s.available && s.message)
    .map((s) => s.message as string);
}

/** Searches as the person types: waits for a pause, ignores answers that arrive late. */
export function useFoodSearch(): FoodSearch {
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SavedFood[]>([]);
  const [results, setResults] = useState<FoodCandidate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const page = useRef(1);
  const latest = useRef(0);

  useEffect(() => {
    const words = query.trim();
    const run = ++latest.current;
    if (words.length < MIN_LETTERS) return;
    const timer = setTimeout(() => {
      page.current = 1;
      setLoading(true);
      // Ask for the quick answer first so results show at once; if a slower database may add
      // more, ask again in the background and swap the fuller list in when it arrives.
      searchFoods(words, 1, "fast")
        .then((found) => {
          if (run !== latest.current) return;
          setSaved(found.saved);
          setResults(found.results);
          setWarnings(warningsFrom(found.sources));
          setHasMore(found.has_more);
          setError(null);
          setSearched(true);
          if (!found.more_coming) return;
          setExtending(true);
          searchFoods(words, 1, "full")
            .then((full) => {
              if (run !== latest.current) return;
              setSaved(full.saved);
              setResults(full.results);
              setWarnings(warningsFrom(full.sources));
              setHasMore(full.has_more);
            })
            .catch(() => {
              // The quick results are still good; say nothing about the extra ones.
            })
            .finally(() => {
              if (run === latest.current) setExtending(false);
            });
        })
        .catch((problem: unknown) => {
          if (run !== latest.current) return;
          setError(
            problem instanceof ApiError
              ? problem.message
              : "The search failed.",
          );
        })
        .finally(() => {
          if (run === latest.current) setLoading(false);
        });
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = useCallback(() => {
    const words = query.trim();
    const run = latest.current;
    const next = page.current + 1;
    setLoading(true);
    searchFoods(words, next)
      .then((found) => {
        if (run !== latest.current) return;
        page.current = next;
        setResults((current) => {
          const have = new Set(
            current.map((food) => `${food.source}:${food.source_id}`),
          );
          return [
            ...current,
            ...found.results.filter(
              (f) => !have.has(`${f.source}:${f.source_id}`),
            ),
          ];
        });
        setHasMore(found.has_more);
      })
      .catch((problem: unknown) => {
        if (run !== latest.current) return;
        setError(
          problem instanceof ApiError ? problem.message : "The search failed.",
        );
      })
      .finally(() => {
        if (run === latest.current) setLoading(false);
      });
  }, [query]);

  // Fewer than two letters means "no search": show nothing, whatever was found before.
  const active = query.trim().length >= MIN_LETTERS;
  return {
    query,
    setQuery,
    saved: active ? saved : [],
    results: active ? results : [],
    warnings: active ? warnings : [],
    loading: active && loading,
    extending: active && extending,
    error: active ? error : null,
    hasMore: active && hasMore,
    loadMore,
    searched: active && searched,
  };
}
