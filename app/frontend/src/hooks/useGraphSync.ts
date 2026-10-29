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
  const prevFavsRef = React.useRef<number[] | null>(null);
  const prevCommentsRef = React.useRef<CommentItem[] | null>(null);

  const syncAllCommentsAndFavorites = React.useCallback(async (hash: string, signal: AbortSignal) => {
    const payload = {
      favorites: Array.isArray(favorites) ? favorites : [],
      comments: Array.isArray(comments) ? comments : [],
    };

    await updateGraphConfig(hash, payload, signal);
    if (signal.aborted) return;

    prevFavsRef.current = payload.favorites;
    prevCommentsRef.current = payload.comments;
    setSyncInitialized(true);
  }, [favorites, comments]);

  React.useEffect(() => {
    if (!currentGraphHash) return;

    const favs = Array.isArray(favorites) ? favorites : [];
    const items = Array.isArray(comments) ? comments : [];

    if (!syncInitialized) {
      const controller = new AbortController();
      void (async () => {
        try {
          await syncAllCommentsAndFavorites(currentGraphHash, controller.signal);
        } catch (e) {
          if (!controller.signal.aborted) console.error("Initial full sync failed:", e);
        }
      })();
      return () => controller.abort();
    }

    const prevFavs = prevFavsRef.current ?? [];
    const prevItems = prevCommentsRef.current ?? [];

    const payload: any = {};

    // delta favorites
    if (favs.length !== prevFavs.length) {
      const favSet = new Set(favs);
      const prevSet = new Set(prevFavs);

      if (favs.length > prevFavs.length) {
        for (const idx of favSet) {
          if (!prevSet.has(idx)) {
            payload.favorite_add = idx;
            break;
          }
        }
      } else {
        for (const idx of prevSet) {
          if (!favSet.has(idx)) {
            payload.favorite_remove = idx;
            break;
          }
        }
      }
    }

    // delta comments
    if (items.length !== prevItems.length) {
      const prevIds = new Set(prevItems.map((c) => c.id));
      const ids = new Set(items.map((c) => c.id));

      if (items.length > prevItems.length) {
        const added = items.find((c) => !prevIds.has(c.id));
        if (added) payload.comment_add = added;
      } else {
        const removed = prevItems.find((c) => !ids.has(c.id));
        if (removed) payload.comment_remove = removed.id;
      }
    }

    prevFavsRef.current = favs;
    prevCommentsRef.current = items;

    if (Object.keys(payload).length === 0) return;

    const controller = new AbortController();
    updateGraphConfig(currentGraphHash, payload, controller.signal).catch((err) => {
      console.error("Failed to auto-update graph config:", err);
    });

    return () => controller.abort();
  }, [favorites, comments, currentGraphHash, syncInitialized, syncAllCommentsAndFavorites]);

  const markSyncInitialized = React.useCallback((v: boolean) => {
    setSyncInitialized(v);
  }, []);

  const setPrevFromLoaded = React.useCallback((favs: number[], items: CommentItem[]) => {
    prevFavsRef.current = favs;
    prevCommentsRef.current = items;
  }, []);

  return { syncInitialized, markSyncInitialized, setPrevFromLoaded };
}
