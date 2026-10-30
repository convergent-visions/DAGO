import React from "react";
import type { CommentItem } from "./useComments";
import { updateGraphConfig } from "../graph/api/graphs";

export function useGraphSync(params: {
  currentGraphHash: string | null;
  favorites: number[];
  comments: CommentItem[];
}) {
  const { currentGraphHash, favorites, comments } = params;
  const [syncInitialized, setSyncInitialized] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  const confirmedState = React.useRef<string | null>(null);
  const requestVersion = React.useRef(0);
  // Serialize writes, including across graph switches. Aborting a request does
  // not guarantee that the server stopped processing it.
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    const version = ++requestVersion.current;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      requestVersion.current += 1;
      clearTimeout(retryTimer);
    };
    if (!currentGraphHash) {
      setSyncError(null);
      return cleanup;
    }

    const payload = { favorites, comments };
    const snapshot = JSON.stringify(payload);
    if (syncInitialized && snapshot === confirmedState.current) {
      setSyncError(null);
      return cleanup;
    }

    writeQueue.current = writeQueue.current.then(async () => {
      if (version !== requestVersion.current) return;
      try {
        await updateGraphConfig(currentGraphHash, payload);
        if (version !== requestVersion.current) return;
        confirmedState.current = snapshot;
        setSyncInitialized(true);
        setSyncError(null);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setSyncError(error instanceof Error ? error.message : "Could not save annotations");
        retryTimer = setTimeout(() => setRetryCount((count) => count + 1), 3000);
      }
    });
    return cleanup;
  }, [currentGraphHash, favorites, comments, syncInitialized, retryCount]);

  const markSyncInitialized = React.useCallback((value: boolean) => {
    requestVersion.current += 1;
    if (!value) confirmedState.current = null;
    setSyncInitialized(value);
  }, []);

  const setPrevFromLoaded = React.useCallback((favs: number[], items: CommentItem[]) => {
    requestVersion.current += 1;
    confirmedState.current = JSON.stringify({ favorites: favs, comments: items });
  }, []);

  return { syncInitialized, syncError, markSyncInitialized, setPrevFromLoaded };
}
