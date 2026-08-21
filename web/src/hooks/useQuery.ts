import { useCallback, useEffect, useState } from "react";
import { queryCache, type QueryKey } from "../lib/query-cache";

type QueryState<T> = {
  data: T | undefined;
  loading: boolean;
  stale: boolean;
  error: Error | null;
};

export function useQuery<T>(key: QueryKey, loader: () => Promise<T>, ttl: number) {
  const read = () => queryCache.get<T>(key, ttl);
  const initial = read();
  const [state, setState] = useState<QueryState<T>>({
    data: initial.value,
    loading: initial.value === undefined,
    stale: initial.stale,
    error: null,
  });

  const refresh = useCallback(async () => {
    const cached = read();
    setState((current) => ({ ...current, loading: cached.value === undefined, stale: cached.stale, error: null }));
    try {
      const data = await queryCache.fetch(key, loader);
      setState({ data, loading: false, stale: false, error: null });
      return data;
    } catch (error) {
      const next = error instanceof Error ? error : new Error(String(error));
      setState((current) => ({ ...current, loading: false, error: next }));
      throw next;
    }
  }, [key, loader, ttl]);

  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const next = read();
      setState((current) => ({ ...current, data: next.value, stale: next.stale, loading: next.value === undefined }));
    };
    const unsubscribe = queryCache.subscribe(key, update);
    const cached = read();
    if (cached.value === undefined || cached.stale) void refresh().catch(() => undefined);
    else update();
    return () => { cancelled = true; unsubscribe(); };
  }, [key, refresh, ttl]);

  return { ...state, refresh };
}
