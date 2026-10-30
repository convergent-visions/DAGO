import React, { useEffect, useRef, useState } from "react";
import TabNavigation from "./TabNavigation";
import { NodeInfoProps } from "../leftsidebar/NodeInfo";
import { useFavorites } from "../../hooks/useFavorites";
import { SearchPanel } from "./SearchPanel";
import { FavoritesPanel } from "./FavoritesPanel";
import CommentsPanel from "./CommentsPanel";

type TabKey = "search" | "favorites" | "comments";

interface RightSidebarProps {
  results: NodeInfoProps[];
  onSearch: (field: string, query: string) => void;
  onSelectNode: (node: NodeInfoProps) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  error?: string | null;
  onOptionsChange?: (opts: { matchCase: boolean; matchWords: boolean }) => void;
  filters?: { id: string; field: string; query: string }[];
  onRemoveFilter?: (id: string) => void;
  onHoverResultCard?: (node?: NodeInfoProps) => void;
  nodeNames?: string[] | null;
}

const COLLAPSED_W = 64;
const MIN_W = 260;
const DEFAULT_W = 320;
const MAX_W = 360;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const RS_KEY = "rightSidebarWidth";

const RightSidebar: React.FC<RightSidebarProps> = ({
  results,
  onSearch,
  onSelectNode,
  expanded,
  onExpandedChange,
  activeTab,
  onTabChange,
  error,
  onOptionsChange,
  filters,
  onRemoveFilter,
  onHoverResultCard,
  nodeNames,
}) => {
  const { favorites: favoriteIndices = [] } = useFavorites();

  const [width, setWidth] = useState<number>(expanded ? DEFAULT_W : COLLAPSED_W);
  const [isResizing, setIsResizing] = useState(false);

  const lastExpandedWidthRef = useRef<number>(DEFAULT_W);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  // load saved width
  useEffect(() => {
    const saved = localStorage.getItem(RS_KEY);
    if (saved) {
      const w = clamp(Number(saved), MIN_W, MAX_W);
      lastExpandedWidthRef.current = w;
      if (expanded) setWidth(w);
    } else {
      lastExpandedWidthRef.current = DEFAULT_W;
      if (expanded) setWidth(DEFAULT_W);
    }
  }, []);

  // when expanded changes, set width accordingly
  useEffect(() => {
    if (expanded) {
      setWidth(clamp(lastExpandedWidthRef.current, MIN_W, MAX_W));
    } else {
      setWidth(COLLAPSED_W);
    }
  }, [expanded]);

  // persist width
  useEffect(() => {
    if (!expanded) return;
    localStorage.setItem(RS_KEY, String(width));
  }, [width, expanded]);

  const handleTabClick = React.useCallback(
    (tab: TabKey) => {
      onHoverResultCard?.();
      if (tab === activeTab) {
        onExpandedChange(!expanded);
      } else {
        onTabChange(tab);
        if (!expanded) onExpandedChange(true);
      }
    },
    [activeTab, expanded, onExpandedChange, onTabChange, onHoverResultCard]
  );

  const onResizeStart = (clientX: number) => {
    if (!expanded) return;
    setIsResizing(true);
    startXRef.current = clientX;
    startWRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // mouse resize: Right sidebar -> dragging LEFT handle changes width inversely
  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startXRef.current;
      const nextW = clamp(startWRef.current - dx, MIN_W, MAX_W);
      setWidth(nextW);
      lastExpandedWidthRef.current = nextW;
    };

    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const tabPanelId = `right-panel-${activeTab}`;
  const labelledBy =
    activeTab === "search"
      ? "tab-search"
      : activeTab === "favorites"
      ? "tab-favorites"
      : "tab-comments";

  return (
    <div
      className={[
        "fixed top-0 right-0 z-40 h-screen flex",
        "overflow-visible backdrop-blur-xl shadow-2xl",
        "bg-white/85 text-gray-900 shadow-black/10",
        "dark:bg-black/90 dark:text-gray-200 dark:shadow-black/40",
        isResizing ? "transition-none" : "transition-[width] duration-200",
        "overflow-hidden",
      ].join(" ")}
      onMouseLeave={() => onHoverResultCard?.()}
      style={{ width }}
      aria-expanded={expanded}
    >
      {/* RESIZE HANDLE (left edge) */}
      {expanded && (
        <div
          className="absolute top-0 left-0 h-full w-3 cursor-col-resize"
          onMouseDown={(e) => onResizeStart(e.clientX)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        >
          <div className="absolute top-0 left-0 h-full w-1.5 hover:w-2 transition-[width] hover:bg-blue-500/20" />
        </div>
      )}

      <TabNavigation
        activeTab={activeTab}
        expanded={expanded}
        onTabClick={handleTabClick}
      />

      <div
        id={tabPanelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className={`flex-1 h-full min-w-0 transition-opacity duration-150 ${
          expanded ? "opacity-100" : "opacity-0 pointer-events-none"
        } overflow-x-visible`}
        aria-hidden={!expanded}
      >
        {activeTab === "search" && (
          <SearchPanel
            results={results}
            onSearch={onSearch}
            onSelectNode={onSelectNode}
            error={error}
            onOptionsChange={onOptionsChange}
            filters={filters ?? []}
            onRemoveFilter={onRemoveFilter}
            onHoverResultCard={onHoverResultCard}
          />
        )}

        {activeTab === "favorites" && (
          <FavoritesPanel
            favorites={favoriteIndices}
            onSelectNode={onSelectNode}
            onHoverResultCard={onHoverResultCard}
            nodeNames={nodeNames}
          />
        )}

        {activeTab === "comments" && (
          <CommentsPanel
            onSelectNode={onSelectNode}
            onHoverResultCard={onHoverResultCard}
            nodeNames={nodeNames}
          />
        )}
      </div>
    </div>
  );
};

export default RightSidebar;
