import { useEffect, useRef, useState } from "react";
import { models } from "../api/client";
import type { ModelWithProvider } from "../types";
import { modelApiId } from "../lib/chat";
import { queryCache, queryKeys } from "../lib/query-cache";

/**
 * Loads the model catalog once and keeps the set of valid routing ids
 * (used to prune persisted chat models) available via ref.
 */
export function useChatModels() {
  const [modelList, setModelList] = useState<ModelWithProvider[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const validModelIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    queryCache
      .getOrFetch(queryKeys.models, 30_000, models.listAll)
      .then((list) => {
        if (cancelled) return;
        validModelIdsRef.current = new Set(
          list.map((model) =>
            modelApiId(model.provider_name, model.model_id, model.pretty_id),
          ),
        );
        setModelList(list);
        setModelsError(null);
      })
      .catch((error: Error) => {
        if (!cancelled) setModelsError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { modelList, loadingModels, modelsError, validModelIdsRef };
}
