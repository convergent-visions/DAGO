import React, { useContext, useRef, useState, ChangeEvent } from "react";
import "./style.css";
import { initialPointPositions, initialLinks } from "./demo-graph";

import { AppContext } from "./context/AppContext";

import { NodeInfoProps } from "./components/leftsidebar/NodeInfo";
import AnalysisPanel from "./components/analysispanel/AnalysisPanel";
import LeftSidebar from "./components/leftsidebar/LeftSidebar";
import ToolTip from "./components/ToolTip";
import FocusedNodesList from "./components/FocusedNodesList";
import LoadingModal from "./components/modals/LoadingModal";
import RightSidebar from "./components/rightsidebar/RightSidebar";
import SaveGraphModal from "./components/modals/SaveGraphModal/SaveGraphModal";
import GraphListModal from "./components/modals/GraphListModal";
import LoadSourceModal from "./components/modals/LoadSourceModal/LoadSourceModal";
import SettingsModal from "./components/modals/SettingsModal/SettingsModal";
import LayoutCategoryModal from "./components/modals/LayoutCategoryModal";
import WelcomeScreen from "./WelcomeScreen";

import { useFavorites } from "./hooks/useFavorites";
import { useComments } from "./hooks/useComments";

import type { GraphColors } from "./graph/types";
import {
  DEFAULT_GRAPH_COLORS,
  DEFAULT_MASKED_LINK_OPACITY,
  DEFAULT_MASKED_POINT_OPACITY,
  DEFAULT_POINT_SIZE,
} from "./graph/config";

import { useGraph } from "./hooks/useGraph";
import { useSearch } from "./hooks/useSearch";
import { useGraphSync } from "./hooks/useGraphSync";
import { useGraphLoader } from "./hooks/useGraphLoader";
import type { LayoutType, LayoutOverrides } from "./graph/api/graphs";

import AppToastModal from "./components/modals/AppToastModal";
import { useAppToast } from "./hooks/useAppToast";

type GraphConfig = {
  pointSize: number;
  colors: GraphColors;
  maskedPointOpacity: number;
  maskedLinkOpacity: number;
};

export default function MainApp() {
  const appContext = useContext(AppContext);
  const currentGraphUUID = appContext!.currentGraphUUID;
  const setCurrentGraphUUID = appContext!.setCurrentGraphUUID;

  const [focusMode, setFocusMode] = useState<"off" | "on">("off");
  const [highlightPathToRoot, setHighlightPathToRoot] = useState(false);
  const [focusedNodeIndices, setFocusedNodeIndices] = useState<Set<number>>(new Set());
  const parentChildrenCacheRef = useRef<Map<number, { parents: number[]; children: number[] }>>(new Map());

  // Refs
  const graphRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Graph state
  const [pointPositions, setPointPositions] = useState<Float32Array>(new Float32Array(initialPointPositions));
  const [initialLayout, setInitialLayout] = useState<Float32Array>(new Float32Array(initialPointPositions));
  const [links, setLinks] = useState<Float32Array>(new Float32Array(initialLinks));

  const [selectedNode, setSelectedNode] = useState<NodeInfoProps | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const analysisRequestRef = useRef(0);

  const [graphConfig, setGraphConfig] = useState<GraphConfig>({
    pointSize: DEFAULT_POINT_SIZE,
    colors: DEFAULT_GRAPH_COLORS,
    maskedPointOpacity: DEFAULT_MASKED_POINT_OPACITY,
    maskedLinkOpacity: DEFAULT_MASKED_LINK_OPACITY,
  });

  const [nodeNames, setNodeNames] = useState<string[] | null>(null);

  // layout/category selection flow
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingExt, setPendingExt] = useState<"obo" | "txt" | "json" | null>(null);
  const [layoutModalMode, setLayoutModalMode] = useState<
    "upload" | "recompute" | "change-category" | null
  >(null);

  // modals
  const [loadSourceModalOpen, setLoadSourceModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Graph “hash”
  const [currentGraphHash, setCurrentGraphHash] = useState<string | null>(null);

  // stores
  const favorites = useFavorites();
  const comments = useComments();

  // Graph engine
  const { resetGraphInteraction, fitView, selectNodeByIndex, tooltips, hoverTooltip, highlightSearchResults, highlightResultHover, startDragFromTooltip, addToFocusedNodes, removeFromFocusedNodes, clearFocusedNodes } =
    useGraph(graphRef, pointPositions, links, setSelectedNode, graphConfig, nodeNames || undefined, focusMode, focusedNodeIndices, setFocusedNodeIndices, parentChildrenCacheRef, highlightPathToRoot);

  // Right sidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "favorites" | "comments">("search");

  // Search
  const search = useSearch(currentGraphUUID);

  // Highlight search results in graph
  React.useEffect(() => {
    const indices = search.results.map((r) => r.index).filter((x): x is number => x !== undefined);
    highlightSearchResults(indices);
  }, [search.results, highlightSearchResults]);

  // Sync (favorites/comments) delta
  const graphSync = useGraphSync({
    currentGraphHash,
    favorites: favorites.favorites,
    comments: comments.comments,
  });

  // Loader / saver
  const loader = useGraphLoader({
    setCurrentGraphUUID,
    setCurrentGraphHash,
    setPointPositions,
    setInitialLayout,
    setLinks,
    setSelectedNode,
    setNodeNames,

    graphConfig,
    setGraphConfig,

    favorites: favorites.favorites,
    comments: comments.comments,
    setFavoritesFromGraph: favorites.setFavoritesFromGraph,
    clearFavorites: favorites.clearFavorites,
    setCommentsFromGraph: comments.setCommentsFromGraph,

    fitView,

    markSyncInitialized: graphSync.markSyncInitialized,
    setPrevFromLoaded: graphSync.setPrevFromLoaded,

    currentGraphUUID,
    currentGraphHash,
    onGraphLoaded: () => {
      analysisRequestRef.current += 1;
      resetGraphInteraction();
      search.resetSearch();
      setFocusMode("off");
      setAnalysisResult(null);
    },
  });

  const toast = useAppToast();

  React.useEffect(() => {
    if (graphSync.syncError) {
      toast.showError("Annotations could not be saved. DAGO will retry automatically.");
    }
  }, [graphSync.syncError]);


  // --- handlers ---
  const handleResetView = () => setPointPositions(new Float32Array(initialLayout));

  const handleLoadClick = () => {
    setLoadSourceModalOpen(true);
    loader.fetchGroups();
    setAnalysisResult(null);
  };

  const handleLoadFromFile = () => {
    setLoadSourceModalOpen(false);
    fileInputRef.current?.click();
  };

  const handleOpenSettings = () => setSettingsModalOpen(true);

  const handleExportClick = async () => {
    try {
      await loader.handleExport();
    } catch (e) {
      // user cancelled save dialog -> ignore
      if (
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError") ||
        (typeof e === "object" &&
          e !== null &&
          "message" in e &&
          String((e as any).message).includes("The user aborted a request"))
      ) {
        return;
      }

      toast.showError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleExportHtmlClick = async () => {
    try {
      await loader.handleExportHtml();
    } catch (e) {
      if (
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError") ||
        (typeof e === "object" &&
          e !== null &&
          "message" in e &&
          String((e as any).message).includes("The user aborted a request"))
      ) {
        return;
      }

      toast.showError(e instanceof Error ? e.message : "HTML export failed");
    }
  };

  const handleAnalyzeClick = async () => {
    const request = ++analysisRequestRef.current;
    try {
      const result = await loader.handleAnalyze();
      if (request !== analysisRequestRef.current) return;
      setAnalysisResult(result);
    } catch (e) {
      if (request !== analysisRequestRef.current) return;
      toast.showError(e instanceof Error ? e.message : "Analyze failed");
    }
  };

  // file upload flow
  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "obo" || ext === "txt") {
      setPendingFile(file);
      setPendingExt(ext as "obo" | "txt");
      setLayoutModalMode("upload");
      setShowLayoutModal(true);
      return;
    }

    if (ext === "json") {
      const hasLayout = await loader.jsonHasLayout(file);
      if (hasLayout) {
        try {
          await loader.loadJsonGraph(file, "hierarchical");
        } catch (e) {
          toast.showError(e instanceof Error ? e.message : "JSON load failed");
        }
      } else {
        setPendingFile(file);
        setPendingExt("json");
        setLayoutModalMode("upload");
        setShowLayoutModal(true);
      }
      return;
    }

    toast.showError(`Unhandled file format: .${ext ?? "unknown"}`, "Unsupported file");
  };

  const handleLayoutConfirm = (layoutType: LayoutType, category?: string, overrides?: LayoutOverrides) => {
    if (layoutModalMode === "recompute") {
      setShowLayoutModal(false);
      setLayoutModalMode(null);
      void loader
        .recomputeCurrentLayout(layoutType, overrides)
        .then((fallbackUsed) => {
          if (fallbackUsed) {
            toast.showInfo(
              "Radial layout computed because the hierarchical layout could not be computed."
            );
          }
        })
        .catch((e) => {
          toast.showError(e instanceof Error ? e.message : "Layout recompute failed");
        });
      return;
    }

    if (layoutModalMode === "change-category") {
      setShowLayoutModal(false);
      setLayoutModalMode(null);
      if (!category) return;
      const updateLayout = category === loader.currentCategory
        ? loader.recomputeCurrentLayout(layoutType, overrides)
        : loader.changeCurrentCategory(category, layoutType, overrides);
      void updateLayout
        .then((fallbackUsed) => {
          if (fallbackUsed) {
            toast.showInfo(
              "Radial layout computed because the hierarchical layout could not be computed."
            );
          }
        })
        .catch((e) => {
          toast.showError(e instanceof Error ? e.message : "Failed to change category");
        });
      return;
    }

    // upload mode
    if (!pendingFile || !pendingExt) {
      setShowLayoutModal(false);
      setLayoutModalMode(null);
      return;
    }

    const fileToUpload = pendingFile;
    const ext = pendingExt;

    setShowLayoutModal(false);
    setLayoutModalMode(null);
    setPendingFile(null);
    setPendingExt(null);

    if (ext === "json") {
      void loader.loadJsonGraph(fileToUpload, layoutType).catch((e) => {
        toast.showError(e instanceof Error ? e.message : "JSON load failed");
      });
      return;
    }

    // Category (ontology namespace) only exists for .obo files.
    if (ext === "obo" && !category) {
      toast.showError("Please choose a category.", "Category required");
      return;
    }

    void loader
      .uploadFileWithNamespace(fileToUpload, ext === "obo" ? category! : "", layoutType)
      .then((radialFallback) => {
        if (radialFallback) {
          toast.showInfo(
            "The C++ layout service was unavailable, so the graph was loaded using a radial layout.",
            "Radial layout used"
          );
        }
      })
      .catch((e) => {
        toast.showError(e instanceof Error ? e.message : "Upload failed");
      })
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
  };

  // Single entry point for changing the graph's layout and, when the loaded
  // graph came from an .obo file, its ontology category. Other formats
  // (.txt, .json) have no categories, so the modal falls back to a
  // layout-only recompute for them.
  const handleChangeViewClick = () => {
    if (!currentGraphUUID) {
      toast.showError("Load a graph first to change its view.", "No graph loaded");
      return;
    }

    const hasCategories = Boolean(loader.categories && loader.categories.length > 0);
    setLayoutModalMode(hasCategories ? "change-category" : "recompute");
    setShowLayoutModal(true);
  };

  // save modal submit wrapper
  const handleSaveModalSubmit = async (groupName: string | null, password: string | null) => {
    try {
      const baseBody = await loader.handleSaveToDb(groupName ?? undefined, password ?? undefined);

      const body = {
        ...baseBody,
        canvas_positions: Array.from(pointPositions),
        links: Array.from(links),
      } as any;

      await loader.saveGraph(body);
    } finally {
    }
  };

  const handleFocusModeToggle = () => {
    const isTurningOn = focusMode === "off";
    const newMode = isTurningOn ? "on" : "off";

    setFocusMode(newMode);

    if (isTurningOn) {
      setFocusedNodeIndices(new Set());

      if (parentChildrenCacheRef.current) {
        parentChildrenCacheRef.current.clear();
      }

      toast.showInfo("Focus mode on - click nodes to add them and their connections");
    } else {
      toast.showInfo("Focus mode off");
      clearFocusedNodes();
    }
  };

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const handleMaskedPointOpacityChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setGraphConfig((prev) => ({
      ...prev,
      maskedPointOpacity: clamp01(parsed),
    }));
  };

  const handleMaskedLinkOpacityChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setGraphConfig((prev) => ({
      ...prev,
      maskedLinkOpacity: clamp01(parsed),
    }));
  };

  return (
    <div id="layout" className="flex h-screen flex-col bg-white text-gray-900 dark:bg-black dark:text-gray-200">
      <div ref={canvasRef} className="grow" />

      <div ref={graphRef} id="graph" className="relative grow">

        {!currentGraphUUID && !loader.loading && (
          <WelcomeScreen onLoadClick={handleLoadClick} />
        )}

        {tooltips.map((tt) => (
          <ToolTip
            key={tt.index}
            visible
            x={tt.x}
            y={tt.y}
            content={tt.content}
            onPointerDown={(e) => startDragFromTooltip(tt.index, e)}
            onClick={() => {
              if (focusMode !== "on") {
                selectNodeByIndex(tt.index, { zoom: false });
                return;
              }

              if (focusedNodeIndices.has(tt.index)) {
                selectNodeByIndex(tt.index, { zoom: false });
                return;
              }

              void addToFocusedNodes(tt.index);
            }}
          />
        ))}

        {hoverTooltip && (
          <ToolTip
            key={`hover-${hoverTooltip.index}`}
            visible={true}
            x={hoverTooltip.x}
            y={hoverTooltip.y}
            content={<strong>{hoverTooltip.content}</strong>}
          />
        )}

        {focusMode === "on" && (
          <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2">
            <div className="rounded-2xl shadow-lg bg-yellow-300 text-black dark:bg-yellow-600 dark:text-black px-4 py-3 min-w-[360px]">
              <div className="inline-flex items-center gap-3 w-full justify-between">
                <span className="font-medium">Focus mode on</span>
                <button
                  className="underline text-sm"
                  onClick={() => {
                    setFocusMode("off");
                    clearFocusedNodes();
                  }}
                >
                  Turn off
                </button>
              </div>

              <div className="mt-2 space-y-2 text-xs">
                <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={highlightPathToRoot}
                      onChange={(e) => setHighlightPathToRoot(e.target.checked)}
                    />
                    Highlight path to root
                </label>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <label htmlFor="masked-point-opacity">Masked vertices opacity</label>
                  <input
                    id="masked-point-opacity"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={graphConfig.maskedPointOpacity}
                    onChange={(e) => handleMaskedPointOpacityChange(e.target.value)}
                    className="w-16 rounded border border-black/25 bg-white/80 px-1 py-0.5 text-right"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={graphConfig.maskedPointOpacity}
                  onChange={(e) => handleMaskedPointOpacityChange(e.target.value)}
                  className="w-full accent-black"
                />

                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <label htmlFor="masked-link-opacity">Masked edges opacity</label>
                  <input
                    id="masked-link-opacity"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={graphConfig.maskedLinkOpacity}
                    onChange={(e) => handleMaskedLinkOpacityChange(e.target.value)}
                    className="w-16 rounded border border-black/25 bg-white/80 px-1 py-0.5 text-right"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={graphConfig.maskedLinkOpacity}
                  onChange={(e) => handleMaskedLinkOpacityChange(e.target.value)}
                  className="w-full accent-black"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {analysisResult && (
        <AnalysisPanel
          result={analysisResult}
          onClose={() => setAnalysisResult(null)}
          nodeNames={nodeNames}
          onSelectNode={(node) => selectNodeByIndex(node.index)}
          onHoverResultCard={(node) => highlightResultHover(node?.index)}
        />
      )}

      {focusMode === "on" && focusedNodeIndices.size > 0 && (
        <FocusedNodesList
          nodeIndices={Array.from(focusedNodeIndices)}
          nodeNames={nodeNames}
          onRemoveNode={removeFromFocusedNodes}
          onClear={clearFocusedNodes}
          onSelectNode={(index) => selectNodeByIndex(index, { zoom: true })}
          onHoverNode={highlightResultHover}
        />
      )}

      {currentGraphUUID && !loader.loading && (
        <LeftSidebar
          handleLoadClick={handleLoadClick}
          fitView={fitView}
          resetView={handleResetView}
          handleExportClick={handleExportClick}
          handleExportHtmlClick={handleExportHtmlClick}
          handleAnalyzeClick={handleAnalyzeClick}
          handleSaveLayoutClick={() => {
            setSaveModalOpen(true);
            loader.fetchGroups();
          }}
          handleChangeViewClick={handleChangeViewClick}
          handleOpenSettings={handleOpenSettings}
          handleFocusModeToggle={handleFocusModeToggle}
          selectedNode={selectedNode}
        />
      )}

      <input
        type="file"
        accept=".txt,.obo,.json"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      <LayoutCategoryModal
        open={showLayoutModal}
        showTuning={layoutModalMode !== "upload"}
        initialOverrides={loader.layoutOverrides}
        showCategory={
          layoutModalMode === "change-category" ||
          (layoutModalMode === "upload" && pendingExt === "obo")
        }
        categories={layoutModalMode === "change-category" ? loader.categories ?? undefined : undefined}
        currentCategory={layoutModalMode === "change-category" ? loader.currentCategory ?? undefined : undefined}
        fileName={layoutModalMode === "upload" ? pendingFile?.name : undefined}
        onCancel={() => {
          setShowLayoutModal(false);
          setLayoutModalMode(null);
          setPendingFile(null);
          setPendingExt(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onConfirm={handleLayoutConfirm}
      />

      {loader.loading && <LoadingModal message={loader.loadingMessage} />}

      {currentGraphUUID && !loader.loading && (
        <RightSidebar
          onSearch={search.handleSearch}
          results={search.results}
          onSelectNode={(node) => selectNodeByIndex(node.index)}
          error={search.error}
          expanded={sidebarExpanded}
          onExpandedChange={setSidebarExpanded}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOptionsChange={search.setSearchOptions}
          filters={search.filters}
          onRemoveFilter={search.handleRemoveFilter}
          onHoverResultCard={(node) => highlightResultHover(node?.index)}
          nodeNames={nodeNames}
        />
      )}

      <SaveGraphModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSubmit={handleSaveModalSubmit}
        loading={loader.saveModalLoading}
        hash={loader.saveModalHash}
        error={loader.saveModalError}
        groups={loader.groups}
        groupsLoading={loader.groupsLoading}
        onRefreshGroups={loader.fetchGroups}
      />

      <LoadSourceModal
        open={loadSourceModalOpen}
        onClose={() => {
          setLoadSourceModalOpen(false);
        }}
        onSelectFile={handleLoadFromFile}
        onSelectHash={async (hash) => {
          try {
            await loader.handleLoadByHash(hash);
            setLoadSourceModalOpen(false);
          } catch (e) {
            toast.showError(e instanceof Error ? e.message : "Load from hash failed");
          }
        }}
        onSelectDb={async (groupName, password) => {
          try {
            await loader.handleLoadFromDbSubmit(groupName, password);
            setLoadSourceModalOpen(false);
          } catch (e) {
            toast.showError(e instanceof Error ? e.message : "Load from DB failed");
          }
        }}
        loading={loader.loadFromDbLoading || loader.groupsLoading}
        error={loader.loadFromDbError || loader.groupsError}
        groups={loader.groups}
        onRefreshGroups={loader.fetchGroups}
      />

      {loader.graphListOpen && (
        <GraphListModal
        list={loader.graphList}
        onSelect={async (id) => {
          try {
            await loader.handleSelectGraphFromDb(id);
          } catch (e) {
            toast.showError(e instanceof Error ? e.message : "Failed to load graph");
          }
        }}
        onClose={() => loader.setGraphListOpen(false)}
        />
      )}

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        pointSize={graphConfig.pointSize || 1}
        colors={graphConfig.colors || DEFAULT_GRAPH_COLORS}
        onApply={(pointSize, colors) => {
          setGraphConfig((prev) => ({ ...prev, pointSize, colors }));
          setSettingsModalOpen(false);
        }}
      />

      <AppToastModal
        state={toast.toast}
        onClose={toast.closeToast}
      />

    </div>
  );
}
