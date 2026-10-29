import React from "react";
import type { CommentItem } from "./useComments";
import type { NodeInfoProps } from "../components/leftsidebar/NodeInfo";
import type { GraphColors } from "../graph/types";
import {
  getGroups,
  getGraphsInGroup,
  type GroupInfo,
  type GraphListItem,
} from "../graph/api/groups";
import {
  loadGraphByHash,
  loadGraphFromJson,
  makeGraphStructure,
  recomputeLayout as recomputeLayoutApi,
  changeCategory as changeCategoryApi,
  saveGraphToDb,
  exportGraph,
  analyzeGraph,
  type LayoutType,
  type LayoutOverrides,
  type LoadedGraph,
  type GraphProgressEvent,
  type SaveGraphBody,
} from "../graph/api/graphs";
import { buildStandaloneGraphHtml } from "../graph/export/buildStandaloneHtml";

type GraphConfig = {
  pointSize: number;
  colors: GraphColors;
  maskedPointOpacity: number;
  maskedLinkOpacity: number;
};

function errMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e;
  return fallback;
}

async function saveBlobToFile(blob: Blob, filename: string, description: string, accept: Record<string, string[]>) {
  if ((window as any).showSaveFilePicker) {
    const opts = {
      suggestedName: filename,
      types: [{ description, accept }],
    };
    const handle = await (window as any).showSaveFilePicker(opts);
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export function useGraphLoader(params: {
  // state setters from MainApp
  setCurrentGraphUUID: (uuid: string | null) => void;
  setCurrentGraphHash: (hash: string | null) => void;

  setPointPositions: (p: Float32Array) => void;
  setInitialLayout: (p: Float32Array) => void;
  setLinks: (l: Float32Array) => void;
  setSelectedNode: (n: NodeInfoProps | null) => void;
  setNodeNames: (names: string[] | null) => void;

  graphConfig: GraphConfig;
  setGraphConfig: React.Dispatch<React.SetStateAction<GraphConfig>>;

  favorites: number[];
  comments: CommentItem[];
  setFavoritesFromGraph: (indices: number[]) => void;
  clearFavorites: () => void;
  setCommentsFromGraph: (items: CommentItem[]) => void;

  fitView: () => void;

  // sync helpers
  markSyncInitialized: (v: boolean) => void;
  setPrevFromLoaded: (favs: number[], comments: CommentItem[]) => void;

  currentGraphUUID: string | null;
  currentGraphHash: string | null;
  onGraphLoaded?: () => void;
}) {
  const {
    setCurrentGraphUUID,
    setCurrentGraphHash,
    setPointPositions,
    setInitialLayout,
    setLinks,
    setSelectedNode,
    setNodeNames,
    graphConfig,
    setGraphConfig,
    favorites,
    comments,
    setFavoritesFromGraph,
    clearFavorites,
    setCommentsFromGraph,
    fitView,
    markSyncInitialized,
    setPrevFromLoaded,
    currentGraphUUID,
    currentGraphHash,
    onGraphLoaded,
  } = params;

  const [loading, setLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState("Loading graph...");

  const [groups, setGroups] = React.useState<GroupInfo[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);

  const [graphList, setGraphList] = React.useState<GraphListItem[]>([]);
  const [graphListOpen, setGraphListOpen] = React.useState(false);

  const [loadFromDbError, setLoadFromDbError] = React.useState<string | null>(null);
  const [loadFromDbLoading, setLoadFromDbLoading] = React.useState(false);

  const [saveModalHash, setSaveModalHash] = React.useState<string | null>(null);
  const [saveModalError, setSaveModalError] = React.useState<string | null>(null);
  const [saveModalLoading, setSaveModalLoading] = React.useState(false);

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadLoading, setLoadLoading] = React.useState(false);

  const [layoutOverrides, setLayoutOverrides] = React.useState<LayoutOverrides>({});

  const [categories, setCategories] = React.useState<string[] | null>(null);
  const [currentCategory, setCurrentCategory] = React.useState<string | null>(null);

  const setGraphHashInUrl = (hash: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("g", hash);
    window.history.replaceState(null, "", url.toString());
  };

  const clearHashInUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("g");
    window.history.replaceState(null, "", url.toString());
  };

  function applyLoadedGraph(
    data: LoadedGraph,
    options?: { urlHash?: string | null; fit?: boolean }
  ) {
    setCurrentGraphUUID(data.uuid);
    setCurrentGraphHash(data.graph_hash ?? null);

    setPointPositions(new Float32Array(data.canvas_positions));
    setInitialLayout(new Float32Array(data.canvas_positions));
    setLinks(new Float32Array(data.links));
    setSelectedNode(null);

    setNodeNames(data.names ? data.names : null);
    setCategories(data.categories ?? null);
    setCurrentCategory(data.current_category ?? null);
    setLayoutOverrides(data.layout_overrides ?? {});

    setGraphConfig((prev) => ({
      ...prev,
      pointSize: data.config?.point_size ?? prev.pointSize,
    }));

    // favorites/comments from graph
    if (data.config) {
      if (Array.isArray(data.config.favorites)) setFavoritesFromGraph(data.config.favorites);
      else clearFavorites();

      if (Array.isArray(data.config.comments)) setCommentsFromGraph(data.config.comments);
      else setCommentsFromGraph([]);
    } else {
      clearFavorites();
      setCommentsFromGraph([]);
    }

    const loadedFavs = Array.isArray(data.config?.favorites) ? data.config!.favorites! : [];
    const loadedComments = Array.isArray(data.config?.comments) ? data.config!.comments! : [];

    setPrevFromLoaded(loadedFavs, loadedComments);
    markSyncInitialized(Boolean(data.graph_hash));

    if (options?.urlHash) setGraphHashInUrl(options.urlHash);
    else clearHashInUrl();

    if (options?.fit) setTimeout(() => fitView(), 100);
    // notify caller that a graph has been loaded
    try {
      onGraphLoaded?.();
    } catch {
      // ignore
    }
  }

  // groups
  const fetchGroups = React.useCallback(async () => {
    try {
      setGroupsLoading(true);
      setGroupsError(null);
      const data = await getGroups();
      setGroups(data);
    } catch (e) {
      setGroupsError(errMessage(e, "Unexpected error while loading groups."));
      throw e;
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // auto-load by ?g=
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const byQuery = params.get("g");
    const byHash = window.location.hash ? window.location.hash.slice(1) : null;
    const g = byQuery || byHash;
    if (!g) return;

    setLoading(true);
    loadGraphByHash(g)
      .then((data) => applyLoadedGraph(data, { urlHash: g, fit: true }))
      .catch((e) => {
        setLoadError(errMessage(e, "Failed to load graph from link."));
      })
      .finally(() => setLoading(false));
  }, []);

  // load from DB (group)
  const handleLoadFromDbSubmit = React.useCallback(
    async (groupName: string, password: string) => {
      try {
        setLoadFromDbLoading(true);
        setLoadFromDbError(null);

        const list = await getGraphsInGroup(groupName, password);

        if (!list.length) {
          setLoadFromDbError("No graphs in this group.");
          return;
        }

        setGraphList(list);
        setGraphListOpen(true);
      } catch (e) {
        const msg = errMessage(e, "Unexpected error while loading graphs from DB.");
        setLoadFromDbError(msg);
        throw new Error(msg);
      } finally {
        setLoadFromDbLoading(false);
      }
    },
    []
  );

  const handleSelectGraphFromDb = React.useCallback(
    async (graphId: string) => {
      try {
        setLoadFromDbLoading(true);
        setLoadFromDbError(null);

        const data = await loadGraphByHash(graphId.trim());
        applyLoadedGraph(data, { urlHash: graphId.trim(), fit: true });
        setGraphListOpen(false);
        setTimeout(() => fitView(), 100);
      } catch (e) {
        const msg = errMessage(e, "Failed to load graph from database.");
        setLoadFromDbError(msg);
        throw new Error(msg);
      } finally {
        setLoadFromDbLoading(false);
      }
    },
    [fitView]
  );

  // load by hash modal
  const handleLoadByHash = React.useCallback(async (hash: string) => {
    try {
      setLoadLoading(true);
      setLoadError(null);

      const data = await loadGraphByHash(hash.trim());
      applyLoadedGraph(data, { urlHash: hash.trim(), fit: true });
    } catch (e) {
      const msg = errMessage(e, "Graph not found for the given hash.");
      setLoadError(msg);
      throw new Error(msg);
    } finally {
      setLoadLoading(false);
    }
  }, []);

  // save to db (prepare base body)
  const handleSaveToDb = React.useCallback(
    async (groupName?: string, password?: string) => {
      try {
        setSaveModalLoading(true);
        setSaveModalError(null);
        setSaveModalHash(null);

        const body: SaveGraphBody = {
          canvas_positions: [],
          links: [],
          graph_hash: currentGraphHash,
          point_size: graphConfig?.pointSize ?? null,
          favorites,
          comments,
        };

        if (groupName && password) {
          body.group_name = groupName;
          body.group_password = password;
        }

        return body;
      } finally {
        setSaveModalLoading(false);
      }
    },
    [comments, currentGraphHash, favorites, graphConfig?.pointSize]
  );

  const saveGraph = React.useCallback(
    async (body: SaveGraphBody) => {
      setSaveModalLoading(true);
      setSaveModalError(null);
      setSaveModalHash(null);
      try {
        const { hash } = await saveGraphToDb(currentGraphUUID, body);
        setCurrentGraphHash(hash);
        setSaveModalHash(hash);
        setGraphHashInUrl(hash);
        return hash;
      } catch (e) {
        const msg = errMessage(e, "Failed to save the graph to the database.");
        setSaveModalError(msg);
        throw new Error(msg);
      } finally {
        setSaveModalLoading(false);
      }
    },
    [currentGraphUUID]
  );

  // file helpers
  const jsonHasLayout = React.useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const text = reader.result as string;
          const data = JSON.parse(text);

          const vertices = data?.vertices;
          const numVertices = data?.num_of_vertices;

          if (!Array.isArray(vertices) || typeof numVertices !== "number") {
            resolve(false);
            return;
          }

          const hasLayout = vertices.every(
            (v: any) =>
              Array.isArray(v?.pos) &&
              v.pos.length === 2 &&
              typeof v.pos[0] === "number" &&
              typeof v.pos[1] === "number"
          );

          resolve(hasLayout);
        } catch {
          resolve(false);
        }
      };

      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }, []);

  const loadJsonGraph = React.useCallback(async (file: File, layoutType: LayoutType) => {
    setLoading(true);
    try {
      const data = await loadGraphFromJson(file, layoutType);
      applyLoadedGraph(data, { fit: true });
      return Boolean(data.fallback_used);
    } catch (e) {
      throw new Error(errMessage(e, "Unexpected error while loading JSON graph."));
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadFileWithNamespace = React.useCallback(
    async (file: File, namespace: string, layoutType: LayoutType) => {
      setLoading(true);
      setLoadingMessage("Starting graph build...");
      let radialFallback = false;
      try {
        const data = await makeGraphStructure(
          file,
          namespace,
          layoutType,
          ({ stage, message }: GraphProgressEvent) => {
            if (stage === "layout_fallback") {
              radialFallback = true;
              return;
            }

            setLoadingMessage(message);
          }
        );
        applyLoadedGraph(data, { fit: true });
        return radialFallback;
      } catch (e) {
        throw new Error(errMessage(e, "Upload error"));
      } finally {
        setLoading(false);
        setLoadingMessage("Loading graph...");
      }
    },
    []
  );

  const recomputeCurrentLayout = React.useCallback(
    async (layoutType: LayoutType, overrides?: LayoutOverrides) => {
      if (!currentGraphUUID) {
        throw new Error("No graph loaded, cannot change layout.");
      }

      setLoading(true);
      try {
        const data = await recomputeLayoutApi(currentGraphUUID, layoutType, overrides);
        setLayoutOverrides(data.layout_overrides ?? {});
        setPointPositions(new Float32Array(data.canvas_positions));
        setInitialLayout(new Float32Array(data.canvas_positions));
        setLinks(new Float32Array(data.links));
        setSelectedNode(null);
        if (Array.isArray(data.names)) setNodeNames(data.names);
        setTimeout(() => fitView(), 100);
        return Boolean(data.fallback_used);
      } catch (e) {
        throw new Error(errMessage(e, "Failed to recompute layout."));
      } finally {
        setLoading(false);
      }
    },
    [currentGraphUUID, fitView, setInitialLayout, setLinks, setNodeNames, setPointPositions, setSelectedNode]
  );

  const changeCurrentCategory = React.useCallback(
    async (category: string, layoutType: LayoutType, overrides?: LayoutOverrides) => {
      if (!currentGraphUUID) {
        throw new Error("No graph loaded, cannot change category.");
      }

      setLoading(true);
      try {
        const data = await changeCategoryApi(currentGraphUUID, category, layoutType, overrides);
        setLayoutOverrides(data.layout_overrides ?? {});
        setPointPositions(new Float32Array(data.canvas_positions));
        setInitialLayout(new Float32Array(data.canvas_positions));
        setLinks(new Float32Array(data.links));
        setSelectedNode(null);
        if (Array.isArray(data.names)) setNodeNames(data.names);
        setCurrentCategory(data.category);
        setTimeout(() => fitView(), 100);
        return Boolean(data.fallback_used);
      } catch (e) {
        throw new Error(errMessage(e, "Failed to change category."));
      } finally {
        setLoading(false);
      }
    },
    [currentGraphUUID, fitView, setInitialLayout, setLinks, setNodeNames, setPointPositions, setSelectedNode]
  );

  // export / analyze
  const handleExport = React.useCallback(async () => {
    if (!currentGraphUUID) {
      throw new Error("No graph loaded, cannot export.");
    }

    try {
      const data = await exportGraph(currentGraphUUID);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      await saveBlobToFile(blob, "graph-data.json", "JSON Files", { "application/json": [".json"] });
    } catch (e) {
      throw new Error(errMessage(e, "Failed to export graph from backend."));
    }
  }, [currentGraphUUID]);

  const handleExportHtml = React.useCallback(async () => {
    if (!currentGraphUUID) {
      throw new Error("No graph loaded, cannot export.");
    }

    try {
      const data = await exportGraph(currentGraphUUID);
      const html = buildStandaloneGraphHtml(data);
      const blob = new Blob([html], { type: "text/html" });
      const filename = `${(data.name || "graph").replace(/[^a-z0-9_-]+/gi, "_")}.html`;
      await saveBlobToFile(blob, filename, "HTML Files", { "text/html": [".html"] });
    } catch (e) {
      throw new Error(errMessage(e, "Failed to export graph as HTML."));
    }
  }, [currentGraphUUID]);

  const handleAnalyze = React.useCallback(async () => {
    try {
      return await analyzeGraph(currentGraphUUID);
    } catch (e) {
      throw new Error(errMessage(e, "Analyze failed."));
    }
  }, [currentGraphUUID]);

  return {
    // state
    loading,
    loadingMessage,

    groups,
    groupsLoading,
    groupsError,
    fetchGroups,

    graphList,
    graphListOpen,
    setGraphListOpen,

    loadFromDbError,
    loadFromDbLoading,
    handleLoadFromDbSubmit,
    handleSelectGraphFromDb,

    loadError,
    loadLoading,
    handleLoadByHash,
    setLoadError,

    categories,
    currentCategory,
    layoutOverrides,

    saveModalHash,
    saveModalError,
    saveModalLoading,
    handleSaveToDb,
    saveGraph,

    // file ops
    jsonHasLayout,
    loadJsonGraph,
    uploadFileWithNamespace,
    recomputeCurrentLayout,
    changeCurrentCategory,

    // export/analyze
    handleExport,
    handleExportHtml,
    handleAnalyze,
  };
}
