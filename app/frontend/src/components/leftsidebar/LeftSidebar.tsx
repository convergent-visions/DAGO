import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  Focus,
  RotateCcw,
  Layers,
  LineChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Save,
  Crosshair
} from "lucide-react";
import NodeInfo, { NodeInfoProps } from "./NodeInfo";
import ExportMenuButton from "./ExportMenuButton";

interface LeftSidebarProps {
  handleLoadClick: () => void;
  fitView: () => void;
  resetView: () => void;
  handleExportClick: () => void;
  handleExportHtmlClick: () => void;
  handleAnalyzeClick: () => void;
  handleSaveLayoutClick: () => void;
  handleChangeViewClick: () => void;
  handleOpenSettings: () => void;
  handleFocusModeToggle: () => void;
  selectedNode?: NodeInfoProps | null;
}

interface Item {
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  custom?: React.ReactNode;
}

const COLLAPSED_W = 64;
const MIN_W = 240;
const FULL_W = 320;
const MAX_W = 400;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const LS_KEY = "leftSidebarWidth";

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  handleLoadClick,
  fitView,
  resetView,
  handleExportClick,
  handleExportHtmlClick,
  handleAnalyzeClick,
  handleSaveLayoutClick,
  handleChangeViewClick,
  handleOpenSettings,
  handleFocusModeToggle,
  selectedNode,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState<number>(COLLAPSED_W);
  const [isResizing, setIsResizing] = useState(false);

  const lastExpandedWidthRef = useRef<number>(360);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const w = clamp(Number(saved), MIN_W, MAX_W);
      lastExpandedWidthRef.current = w;
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    localStorage.setItem(LS_KEY, String(width));
  }, [width, expanded]);

  const isCollapsed = width <= COLLAPSED_W + 8;
  const isCompact = expanded && width < FULL_W;
  const isFull = expanded && width >= FULL_W;

  const items: Item[] = [
    { label: "Load data", shortLabel: "Load", icon: <Upload size={18} />, onClick: handleLoadClick },
    { label: "Fit view", shortLabel: "Fit", icon: <Focus size={18} />, onClick: fitView },
    { label: "Reset layout", shortLabel: "Reset", icon: <RotateCcw size={18} />, onClick: resetView },
    {
      label: "Export",
      custom: (
        <ExportMenuButton
          expanded={expanded}
          isCollapsed={isCollapsed}
          isCompact={isCompact}
          onExportJson={handleExportClick}
          onExportHtml={handleExportHtmlClick}
        />
      ),
      icon: null,
    },
    { label: "Analyze", shortLabel: "Analyze", icon: <LineChart size={18} />, onClick: handleAnalyzeClick },
    { label: "Change view", shortLabel: "View", icon: <Layers size={18} />, onClick: handleChangeViewClick },
    { label: "Save layout", shortLabel: "Save", icon: <Save size={18} />, onClick: handleSaveLayoutClick },
    { label: "Focus mode", shortLabel: "Focus", icon: <Crosshair size={18} />, onClick: handleFocusModeToggle },
  ];

  const bottom: Item[] = [
    { label: "Settings", shortLabel: "Settings", icon: <Settings size={18} />, onClick: handleOpenSettings },
  ];

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        setWidth(clamp(lastExpandedWidthRef.current, MIN_W, MAX_W));
      } else {
        lastExpandedWidthRef.current = width;
        setWidth(COLLAPSED_W);
      }
      return next;
    });
  };

  const onResizeStart = (clientX: number) => {
    if (!expanded) return;
    setIsResizing(true);
    startXRef.current = clientX;
    startWRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // mouse
  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startXRef.current;
      const nextW = clamp(startWRef.current + dx, MIN_W, MAX_W);
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

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-40 flex flex-col h-screen",
        "bg-white/85 backdrop-blur-xl border-r border-black/10 shadow-2xl text-gray-900",
        "dark:bg-black/90 dark:border-white/10 dark:shadow-black/50 dark:text-gray-200",
        isResizing ? "transition-none" : "transition-[width] duration-200",
        "overflow-hidden",
      ].join(" ")}
      style={{ width }}
      aria-expanded={expanded}
      aria-label="Left sidebar"
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-black/10 dark:border-white/10">
        {expanded && !isCollapsed && (
          <span className="font-semibold text-sm tracking-wide">MENU</span>
        )}

        <button
          type="button"
          onClick={toggleExpanded}
          className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* ACTION BUTTONS */}
      <nav className="px-2 py-2 space-y-1 border-b border-black/10 dark:border-white/10">
        {items.map((item) =>
          item.custom ? (
            <React.Fragment key={item.label}>{item.custom}</React.Fragment>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (isResizing) return;
                item.onClick?.();
              }}
              className="group w-full flex items-center px-2.5 py-2 rounded-lg
                hover:bg-black/5 dark:hover:bg-white/5 transition"
              title={item.label}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
                {item.icon}
              </span>

              {expanded && !isCollapsed && (
                <span className="ml-3 text-sm truncate">
                  {isCompact ? item.shortLabel : item.label}
                </span>
              )}
            </button>
          )
        )}
      </nav>

      {/* NODE INFO */}
      <div className="flex-1 min-h-0 px-3 py-3 overflow-y-auto">
        {expanded && !isCollapsed && (
          <>
            <p className="mb-2 text-[11px] uppercase text-gray-500">
              Node details
            </p>

            {selectedNode ? (
              isFull ? (
                <NodeInfo {...selectedNode} />
              ) : (
                <NodeInfo {...selectedNode} compact compactFieldsLimit={6} />
              )
            ) : (
              <div className="rounded-xl border p-3 text-xs text-gray-500">
                Select a node in the graph.
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM */}
      <div className="border-t border-black/10 dark:border-white/10 p-2">
        {bottom.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              if (isResizing) return;
              item.onClick?.();
            }}
            className="w-full flex items-center px-3 py-2.5 rounded-lg
              hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
              {item.icon}
            </span>
            {expanded && !isCollapsed && (
              <span className="ml-3 text-sm truncate">
                {isCompact ? item.shortLabel : item.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* RESIZE HANDLE */}
      {expanded && (
        <div
          className="absolute top-0 right-0 h-full w-3 cursor-col-resize"
          onMouseDown={(e) => onResizeStart(e.clientX)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        >
          <div className="absolute top-0 right-0 h-full w-1.5 hover:w-2 transition-[width] hover:bg-blue-500/20" />
        </div>
      )}
    </aside>
  );
};

export default LeftSidebar;