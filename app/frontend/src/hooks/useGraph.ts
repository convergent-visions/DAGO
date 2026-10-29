import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { Graph, GraphConfigInterface } from "@cosmograph/cosmos";
import { NodeInfoProps } from "../components/leftsidebar/NodeInfo";
import { AppContext } from "../context/AppContext";
import { DEFAULT_GRAPH_COLORS } from "../graph/config";

import { fetchNodeData } from "../graph/api/node";
import { sleep } from "../graph/utils/time";
import { buildParentsByNode, computeParentsChildren, computeShortestPathToRoot } from "../graph/utils/relationships";
import {
  computePinnedTooltips,
  computeHoverTooltip,
  type NodeTooltip,
} from "../graph/tooltips/positions";
import { applyGraphColors } from "../graph/render/applyColors";
import type { GraphColors } from "../graph/types";

type UseGraphInitialConfig = {
  pointSize?: number;
  colors?: GraphColors;
  maskedPointOpacity?: number;
  maskedLinkOpacity?: number;
};

export function useGraph(
  graphRef: React.RefObject<HTMLDivElement | null>,
  pointPositions: Float32Array,
  links: Float32Array,
  setSelectedNode: Dispatch<SetStateAction<NodeInfoProps | null>>,
  initialConfig?: UseGraphInitialConfig,
  names?: string[],
  focusMode?: "off" | "on",
  focusedNodeIndices?: Set<number>,
  setFocusedNodeIndices?: Dispatch<SetStateAction<Set<number>>>,
  parentChildrenCacheRef?: React.MutableRefObject<Map<number, { parents: number[]; children: number[] }>>,
  highlightPathToRoot?: boolean
) {
  /* -------------------------------------------------------------------------- */
  /* Core refs and state                                                        */
  /* -------------------------------------------------------------------------- */

  const graphInstance = useRef<Graph | null>(null);
  const linksRef = useRef<Float32Array>(links);

  const selectedIndexRef = useRef<number | null>(null);
  const highlightedIndicesRef = useRef<number[]>([]);
  const hoverIndexRef = useRef<number | null>(null);

  const namesCacheRef = useRef<Map<number, string>>(new Map());

  const [tooltips, setTooltips] = useState<NodeTooltip[]>([]);
  const [hoverTooltip, setHoverTooltip] = useState<NodeTooltip | null>(null);

  const highlightTokenRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const searchIndicesRef = useRef<Set<number>>(new Set());
  const hoveredCardIndexRef = useRef<number | null>(null);
  const focusModeRef = useRef<"off" | "on">(focusMode ?? "off");
  const focusedNodeIndicesRef = useRef<Set<number>>(focusedNodeIndices ?? new Set());

  const focusPathNodeIndicesRef = useRef<Set<number>>(new Set());
  const focusPathEdgeIndicesRef = useRef<Set<number>>(new Set());

  const parentsByNode = useMemo(() => buildParentsByNode(links), [links]);

  const appContext = useContext(AppContext);
  const currentGraphUUID = appContext?.currentGraphUUID;
  const currentGraphUUIDRef = useRef<string | null>(currentGraphUUID ?? null);

  const colorsRef = useRef<GraphColors>(
    initialConfig?.colors ?? DEFAULT_GRAPH_COLORS
  );
  const sizeRef = useRef<number>(initialConfig?.pointSize ?? 1);
  const maskedPointOpacityRef = useRef<number>(initialConfig?.maskedPointOpacity ?? 0.2);
  const maskedLinkOpacityRef = useRef<number>(initialConfig?.maskedLinkOpacity ?? 0.2);

  const getName = useCallback(
    (idx: number) => namesCacheRef.current.get(idx) ?? `Node ${idx}`,
    []
  );

  const hasPinnedTooltip = useCallback((index: number) => {
    return highlightedIndicesRef.current.includes(index);
  }, []);

  /* -------------------------------------------------------------------------- */
  /* Tooltip -> Cosmos native drag bridge state                                 */
  /* -------------------------------------------------------------------------- */

  const tooltipDragActiveRef = useRef(false);
  const tooltipDragCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Handshake: wait until Cosmos confirms hover over the target point
  const bridgeTargetIndexRef = useRef<number | null>(null);
  const bridgeHoverOkRef = useRef(false);
  const bridgeDragStartedRef = useRef(false);

  // Throttle tooltip DOM updates during native drag
  const dragTooltipRafRef = useRef<number | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Ref synchronization                                                        */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    colorsRef.current = initialConfig?.colors ?? DEFAULT_GRAPH_COLORS;
  }, [initialConfig?.colors]);

  useEffect(() => {
    sizeRef.current = initialConfig?.pointSize ?? 1;
  }, [initialConfig?.pointSize]);

  useEffect(() => {
    maskedPointOpacityRef.current = initialConfig?.maskedPointOpacity ?? 0.2;
  }, [initialConfig?.maskedPointOpacity]);

  useEffect(() => {
    maskedLinkOpacityRef.current = initialConfig?.maskedLinkOpacity ?? 0.2;
  }, [initialConfig?.maskedLinkOpacity]);

  useEffect(() => {
    focusModeRef.current = focusMode ?? "off";
  }, [focusMode]);

  useEffect(() => {
    focusedNodeIndicesRef.current = focusedNodeIndices ?? new Set();
  }, [focusedNodeIndices]);

  useEffect(() => {
    const pathNodes = new Set<number>();
    const pathEdges = new Set<number>();

    if (
      focusMode !== "on" ||
      !highlightPathToRoot ||
      !focusedNodeIndices
    ) {
      focusPathNodeIndicesRef.current = pathNodes;
      focusPathEdgeIndicesRef.current = pathEdges;
      return;
    }

    for (const focusedNodeIndex of focusedNodeIndices) {
      const {
        pathNodes: nodePath,
        pathEdges: edgePath,
      } = computeShortestPathToRoot(
        focusedNodeIndex,
        parentsByNode
      );

      for (const nodeIndex of nodePath) {
        pathNodes.add(nodeIndex);
      }

      for (const edgeIndex of edgePath) {
        pathEdges.add(edgeIndex);
      }
    }

    focusPathNodeIndicesRef.current = pathNodes;
    focusPathEdgeIndicesRef.current = pathEdges;
  }, [
    focusMode,
    highlightPathToRoot,
    focusedNodeIndices,
    parentsByNode,
  ]);

  useEffect(() => {
    currentGraphUUIDRef.current = currentGraphUUID ?? null;
  }, [currentGraphUUID]);

  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  useEffect(() => {
    const cache = namesCacheRef.current;
    cache.clear();
    if (names?.length) names.forEach((name, idx) => cache.set(idx, name));
  }, [names]);

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                    */
  /* -------------------------------------------------------------------------- */

  const findCanvasEl = useCallback((): HTMLCanvasElement | null => {
    const a = graphRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (a) return a;

    const parent = graphRef.current?.parentElement;
    const b = parent?.querySelector("canvas") as HTMLCanvasElement | null;
    if (b) return b;

    return document.querySelector("canvas");
  }, [graphRef]);

  const dispatchCanvasMouseEvent = useCallback(
    (
      canvas: HTMLCanvasElement,
      type: "mousemove" | "mousedown" | "mouseup",
      args: {
        clientX: number;
        clientY: number;
        button?: number;
        buttons?: number;
      }
    ) => {
      const ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: args.clientX,
        clientY: args.clientY,
        button: args.button ?? 0,
        buttons: args.buttons ?? 0,
      });

      canvas.dispatchEvent(ev);
    },
    []
  );

  const recomputeTooltipsPositions = useCallback(() => {
    const g = graphInstance.current;
    const el = graphRef.current;

    if (!g || !el) {
      setTooltips([]);
      return;
    }

    // In focused mode, only show tooltips for focused nodes
    let indicesToShow = highlightedIndicesRef.current;
    if (focusModeRef.current === "on") {
      indicesToShow = highlightedIndicesRef.current.filter((idx) =>
        focusedNodeIndicesRef.current.has(idx)
      );
    }

    setTooltips(
      computePinnedTooltips(g, el, indicesToShow, getName)
    );
  }, [graphRef, getName]);

  const requestTooltipsRecompute = useCallback(() => {
    if (dragTooltipRafRef.current != null) return;
    dragTooltipRafRef.current = window.requestAnimationFrame(() => {
      dragTooltipRafRef.current = null;
      recomputeTooltipsPositions();
    });
  }, [recomputeTooltipsPositions]);

  const updateHoverTooltipPosition = useCallback(
    (index: number, pointPos?: [number, number]) => {
      const g = graphInstance.current;
      const el = graphRef.current;
      if (!g || !el) return;

      const tt = computeHoverTooltip(g, el, index, getName, pointPos);
      if (!tt) return;

      setHoverTooltip(tt);
    },
    [graphRef, getName]
  );

  /* -------------------------------------------------------------------------- */
  /* Graph view controls                                                        */
  /* -------------------------------------------------------------------------- */

  const fitView = useCallback(() => {
    const g = graphInstance.current;
    g?.fitView();
    g?.render();
    recomputeTooltipsPositions();
  }, [recomputeTooltipsPositions]);

  /* -------------------------------------------------------------------------- */
  /* Coloring logic                                                             */
  /* -------------------------------------------------------------------------- */

  const applyColors = useCallback(
    async (
      selectedIndices: number[],
      parents: number[],
      children: number[],
      opts?: { zoomToSelected?: boolean }
    ) => {
      const g = graphInstance.current;
      if (!g) return;

      highlightedIndicesRef.current = applyGraphColors({
        g,
        links: linksRef.current,
        colors: colorsRef.current,
        size: sizeRef.current,
        selectedIndices,
        parents,
        children,
        searchSet: searchIndicesRef.current,
        hoveredCardIndex: hoveredCardIndexRef.current,
        focusMode: focusModeRef.current,
        focusedNodeIndices: focusedNodeIndicesRef.current,
        maskedPointOpacity: maskedPointOpacityRef.current,
        maskedLinkOpacity: maskedLinkOpacityRef.current,
        focusPathNodeIndices: focusPathNodeIndicesRef.current,
        focusPathEdgeIndices: focusPathEdgeIndicesRef.current,

      });

      const hoverIdx = hoverIndexRef.current;
      if (hoverIdx != null && highlightedIndicesRef.current.includes(hoverIdx)) {
        hoverIndexRef.current = null;
        setHoverTooltip(null);
      }

      const zoomToSelected = opts?.zoomToSelected ?? false;

      if (zoomToSelected && selectedIndices.length > 0) {
        const zoomDuration = 700;
        const zoomScale = 30;

        setTooltips([]);

        const token = ++highlightTokenRef.current;

        g.zoomToPointByIndex(selectedIndices[0], zoomDuration, zoomScale);
        g.render();

        await sleep(zoomDuration);
        if (token !== highlightTokenRef.current) return;

        recomputeTooltipsPositions();
      } else {
        g.render();
        recomputeTooltipsPositions();
      }
    },
    [recomputeTooltipsPositions]
  );

  // Trigger color re-application when focused nodes or focus mode changes
  useEffect(() => {
    const g = graphInstance.current;
    if (!g) return;

    const selectedIndex = selectedIndexRef.current;
    const selectedIndices = selectedIndex !== null ? [selectedIndex] : [];

    const { parents, children } = computeParentsChildren(
      selectedIndices,
      linksRef.current
    );

    void applyColors(selectedIndices, parents, children, { zoomToSelected: false });
  }, [
    focusedNodeIndices,
    focusMode,
    highlightPathToRoot,
    applyColors,
  ]);

  useEffect(() => {
    const g = graphInstance.current;
    if (!g) return;

    const selectedIndex = selectedIndexRef.current;
    const selectedIndices = selectedIndex !== null ? [selectedIndex] : [];

    const { parents, children } = computeParentsChildren(
      selectedIndices,
      linksRef.current
    );

    void applyColors(selectedIndices, parents, children, { zoomToSelected: false });
  }, [
    initialConfig?.colors?.default,
    initialConfig?.colors?.parent,
    initialConfig?.colors?.child,
    initialConfig?.colors?.selected,
    initialConfig?.colors?.hover,
    initialConfig?.colors?.search,
    initialConfig?.colors?.background,
    initialConfig?.pointSize,
    initialConfig?.maskedPointOpacity,
    initialConfig?.maskedLinkOpacity,
    applyColors,
  ]);

  /* -------------------------------------------------------------------------- */
  /* Node selection                                                             */
  /* -------------------------------------------------------------------------- */

  const clearSelection = useCallback(() => {
    selectionRequestRef.current += 1;
    setSelectedNode(null);
    selectedIndexRef.current = null;
    highlightedIndicesRef.current = [];
    setTooltips([]);

    const { parents, children } = computeParentsChildren([], linksRef.current);
    void applyColors([], parents, children, { zoomToSelected: false });
  }, [applyColors, setSelectedNode]);

  const selectNodeByIndex = useCallback(
    async (index?: number, options?: { zoom?: boolean }) => {
      const zoom = options?.zoom ?? true;

      if (index === undefined || index === null) {
        clearSelection();
        return;
      }

      const uuid = currentGraphUUIDRef.current;
      if (!uuid) {
        console.error("No current graph uuid set");
        return;
      }

      const request = ++selectionRequestRef.current;
      try {
        const data = await fetchNodeData(uuid, index);
        if (request !== selectionRequestRef.current || uuid !== currentGraphUUIDRef.current) return;

        setSelectedNode({
          index,
          ...data,
          name: data.name ?? `Node ${index}`,
        });

        selectedIndexRef.current = index;

        if (data.name) {
          namesCacheRef.current.set(index, data.name);
        }

        const { parents, children } = computeParentsChildren(
          [index],
          linksRef.current
        );

        await applyColors([index], parents, children, { zoomToSelected: zoom });
      } catch (err) {
        console.error("Node fetch error:", err);
      }
    },
    [applyColors, clearSelection, setSelectedNode]
  );

  const highlightResultHover = useCallback(
    async (index?: number) => {
      hoveredCardIndexRef.current = index ?? null;

      const selectedIndex = selectedIndexRef.current;
      const selectedIndices = selectedIndex !== null ? [selectedIndex] : [];

      const { parents, children } = computeParentsChildren(
        selectedIndices,
        linksRef.current
      );

      await applyColors(selectedIndices, parents, children, {
        zoomToSelected: false,
      });
    },
    [applyColors]
  );

  const highlightSearchResults = useCallback(
    async (indices: number[]) => {
      searchIndicesRef.current = new Set(indices);

      const selectedIndex = selectedIndexRef.current;
      const selectedIndices = selectedIndex !== null ? [selectedIndex] : [];

      const { parents, children } = computeParentsChildren(
        selectedIndices,
        linksRef.current
      );

      await applyColors(selectedIndices, parents, children, {
        zoomToSelected: false,
      });
    },
    [applyColors]
  );

 /* -------------------------------------------------------------------------- */
/* Tooltip -> Cosmos native drag bridge (start on 2-3px move)                  */
/* -------------------------------------------------------------------------- */

  // How far the pointer must move before we start the drag (px)
  const DRAG_START_THRESHOLD_PX = 3;
  const DRAG_START_THRESHOLD_PX2 = DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX;

  // For threshold and stable mouseup
  const bridgeStartClientRef = useRef<[number, number] | null>(null);
  const bridgeLastClientRef = useRef<[number, number] | null>(null);
  const bridgeMovedRef = useRef(false);


  // Node screen position at start (client coords)
  const bridgeNodeClientRef = useRef<[number, number] | null>(null);

  const clearBridgeState = useCallback(() => {
    tooltipDragActiveRef.current = false;
    tooltipDragCanvasRef.current = null;

    bridgeTargetIndexRef.current = null;

    bridgeStartClientRef.current = null;
    bridgeLastClientRef.current = null;
    bridgeMovedRef.current = false;

    bridgeDragStartedRef.current = false;
    bridgeNodeClientRef.current = null;
  }, []);

  const startDragFromTooltip = useCallback(
    (index: number, e: React.PointerEvent) => {
      const g = graphInstance.current;
      const canvas = findCanvasEl();
      if (!g || !canvas) return;

      e.preventDefault();
      e.stopPropagation();

      // Ensure we keep receiving pointer events even if cursor leaves tooltip
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      tooltipDragActiveRef.current = true;
      tooltipDragCanvasRef.current = canvas;

      bridgeTargetIndexRef.current = index;
      bridgeDragStartedRef.current = false;
      bridgeMovedRef.current = false;

      bridgeStartClientRef.current = [e.clientX, e.clientY];
      bridgeLastClientRef.current = [e.clientX, e.clientY];

      // Precompute node client coords (where we will "press" to start native drag)
      const positions = g.getPointPositions();
      const i = index * 2;
      if (i + 1 >= positions.length) {
        clearBridgeState();
        return;
      }

      const [nodeLocalX, nodeLocalY] = g.spaceToScreenPosition([
        positions[i],
        positions[i + 1],
      ]);

      const rect = canvas.getBoundingClientRect();
      bridgeNodeClientRef.current = [rect.left + nodeLocalX, rect.top + nodeLocalY];

      // Prime hover detection a bit (no waiting). This increases odds that the first
      // "real" drag start will attach to the node instead of panning background.
      const [nx, ny] = bridgeNodeClientRef.current;
      dispatchCanvasMouseEvent(canvas, "mousemove", { clientX: nx, clientY: ny, buttons: 0 });
      dispatchCanvasMouseEvent(canvas, "mousemove", { clientX: nx, clientY: ny, buttons: 0 });
    },
    [clearBridgeState, dispatchCanvasMouseEvent, findCanvasEl]
  );

  useEffect(() => {
    const startNativeDragIfNeeded = (canvas: HTMLCanvasElement) => {
      if (bridgeDragStartedRef.current) return;

      const nodeClient = bridgeNodeClientRef.current;
      if (!nodeClient) return;

      const [nx, ny] = nodeClient;

      // Stronger hover priming right before mousedown
      // (Cosmos hover detection may run only every few frames)
      for (let k = 0; k < 3; k++) {
        dispatchCanvasMouseEvent(canvas, "mousemove", { clientX: nx, clientY: ny, buttons: 0 });
      }

      // Start native drag on the node position
      dispatchCanvasMouseEvent(canvas, "mousedown", {
        clientX: nx,
        clientY: ny,
        button: 0,
        buttons: 1,
      });

      bridgeDragStartedRef.current = true;
    };

    const onMove = (ev: PointerEvent) => {
      if (!tooltipDragActiveRef.current) return;
      const canvas = tooltipDragCanvasRef.current;
      if (!canvas) return;

      bridgeLastClientRef.current = [ev.clientX, ev.clientY];

      // If we have not started native drag yet, wait until user moves enough
      if (!bridgeDragStartedRef.current) {
        const start = bridgeStartClientRef.current;
        if (!start) return;

        const dx = ev.clientX - start[0];
        const dy = ev.clientY - start[1];
        if (dx * dx + dy * dy < DRAG_START_THRESHOLD_PX2) {
          return; // still a click, not a drag
        }

        bridgeMovedRef.current = true;
        startNativeDragIfNeeded(canvas);
      }

      // Forward move as "drag move" (buttons: 1)
      dispatchCanvasMouseEvent(canvas, "mousemove", {
        clientX: ev.clientX,
        clientY: ev.clientY,
        buttons: 1,
      });

      requestTooltipsRecompute();
    };

    const onUp = (ev: PointerEvent) => {
      if (!tooltipDragActiveRef.current) return;
      const canvas = tooltipDragCanvasRef.current;

      // If drag never started (user just clicked), do not send mouseup.
      // This avoids accidental pan / snap behaviors.
      if (canvas && bridgeDragStartedRef.current) {
        const release = bridgeLastClientRef.current ?? [ev.clientX, ev.clientY];
        const [x, y] = release;

        // Reset internal state first
        dispatchCanvasMouseEvent(canvas, "mousemove", { clientX: x, clientY: y, buttons: 0 });

        // End native drag
        dispatchCanvasMouseEvent(canvas, "mouseup", {
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 0,
        });
      }

      clearBridgeState();
      recomputeTooltipsPositions();
    };

    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    window.addEventListener("pointerup", onUp, { passive: true, capture: true });
    window.addEventListener("pointercancel", onUp, { passive: true, capture: true });

    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true } as any);
      window.removeEventListener("pointerup", onUp, { capture: true } as any);
      window.removeEventListener("pointercancel", onUp, { capture: true } as any);

      if (dragTooltipRafRef.current != null) {
        cancelAnimationFrame(dragTooltipRafRef.current);
        dragTooltipRafRef.current = null;
      }
    };
  }, [clearBridgeState, dispatchCanvasMouseEvent, recomputeTooltipsPositions, requestTooltipsRecompute]);
  /* -------------------------------------------------------------------------- */
  /* Graph initialization                                                       */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!graphRef.current) return;

    const config: GraphConfigInterface = {
      spaceSize: 8192,
      backgroundColor: colorsRef.current.background,
      pointSize: initialConfig?.pointSize ?? 1,
      pointGreyoutOpacity: 0.1,
      linkWidth: 0.8,
      linkColor: "#a1a1a1",
      linkArrows: true,
      curvedLinks: false,
      renderHoveredPointRing: false,
      enableDrag: true,
      enableZoom: true,
      simulationLinkSpring: 0,
      simulationRepulsion: 0,
      simulationGravity: 0,
      simulationDecay: 0,

      onClick: (index) => {
        if (index === null || index === undefined) {
          selectNodeByIndex(undefined);
          return;
        }

        if (focusModeRef.current === "on") {
          if (focusedNodeIndicesRef.current.has(index)) {
            selectNodeByIndex(index, { zoom: false });
          } else {
            void addToFocusedNodes(index);
          }

          return;
        }

        selectNodeByIndex(index, { zoom: false });
      },

      onPointMouseOver: (index, pointPos) => {
        // Hover confirmation for tooltip-drag handshake
        if (bridgeTargetIndexRef.current != null && index === bridgeTargetIndexRef.current) {
          bridgeHoverOkRef.current = true;
        }

        const g = graphInstance.current;
        const el = graphRef.current;
        if (!g || !el) return;

        // Ignore hover UI updates while tooltip drag is active
        if (tooltipDragActiveRef.current) return;

        if (index == null || !pointPos) {
          hoverIndexRef.current = null;
          setHoverTooltip(null);
          return;
        }

        if (
          focusModeRef.current === "on" &&
          !focusedNodeIndicesRef.current.has(index)
        ) {
          hoverIndexRef.current = null;
          setHoverTooltip(null);
          return;
        }

        if (hasPinnedTooltip(index)) {
          hoverIndexRef.current = null;
          setHoverTooltip(null);
          return;
        }

        if (hoverIndexRef.current === index) return;
        hoverIndexRef.current = index;

        updateHoverTooltipPosition(index, pointPos as [number, number]);
      },

      onPointMouseOut: () => {
        hoverIndexRef.current = null;
        setHoverTooltip(null);
      },

      onZoom: () => recomputeTooltipsPositions(),
      onZoomEnd: () => recomputeTooltipsPositions(),

      onDragStart: () => {
        bridgeDragStartedRef.current = true;
      },

      onDrag: () => {
        requestTooltipsRecompute();

        const hoverIdx = hoverIndexRef.current;
        if (hoverIdx == null) return;

        if (hasPinnedTooltip(hoverIdx)) {
          hoverIndexRef.current = null;
          setHoverTooltip(null);
          return;
        }

        updateHoverTooltipPosition(hoverIdx);
      },

      onDragEnd: () => {
        recomputeTooltipsPositions();
      },
    };

    graphInstance.current?.destroy?.();
    graphInstance.current = new Graph(graphRef.current, config);

    return () => {
      highlightTokenRef.current++;
      graphInstance.current?.destroy?.();
      graphInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init only once

  /* -------------------------------------------------------------------------- */
  /* Live config updates                                                        */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const g = graphInstance.current;
    if (!g) return;

    g.setConfig({
      pointSize: initialConfig?.pointSize ?? 1,
      backgroundColor: colorsRef.current.background,
      enableZoom: true,
    });

    g.render();
  }, [initialConfig?.pointSize, initialConfig?.colors?.background]);

  /* -------------------------------------------------------------------------- */
  /* Data updates                                                               */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const g = graphInstance.current;
    if (!g || !pointPositions || !links) return;

    g.setPointPositions(pointPositions);
    g.setLinks(links);
    g.render();

    const selectedIndex = selectedIndexRef.current;
    const selectedIndices = selectedIndex !== null ? [selectedIndex] : [];

    const { parents, children } = computeParentsChildren(
      selectedIndices,
      linksRef.current
    );

    void applyColors(selectedIndices, parents, children, { zoomToSelected: false });
  }, [pointPositions, links, applyColors]);

  const addToFocusedNodes = useCallback(
    (index: number) => {
      if (!setFocusedNodeIndices) return;

      try {
        setFocusedNodeIndices((prev) => {
          if (prev.has(index)) return prev;
          const newSet = new Set(prev);
          newSet.add(index);
          return newSet;
        });
      } catch (err) {
        console.error("Error adding to focused nodes:", err);
      }
    },
    [setFocusedNodeIndices]
  );

  const removeFromFocusedNodes = useCallback(
    (index: number) => {
      if (!setFocusedNodeIndices) return;

      setFocusedNodeIndices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });

      // Also remove from cache
      if (parentChildrenCacheRef) {
        parentChildrenCacheRef.current.delete(index);
      }

      if (selectedIndexRef.current === index) {
        clearSelection();
      }
    },
    [setFocusedNodeIndices, parentChildrenCacheRef]
  );

  const clearFocusedNodes = useCallback(() => {
    if (!setFocusedNodeIndices) return;
    setFocusedNodeIndices(new Set());
    if (parentChildrenCacheRef) {
      parentChildrenCacheRef.current.clear();
    }
  }, [setFocusedNodeIndices, parentChildrenCacheRef]);

  const resetGraphInteraction = useCallback(() => {
    clearSelection();
    clearFocusedNodes();
    highlightTokenRef.current += 1;
    searchIndicesRef.current = new Set();
    hoveredCardIndexRef.current = null;
    hoverIndexRef.current = null;
    focusPathNodeIndicesRef.current = new Set();
    focusPathEdgeIndicesRef.current = new Set();
    setHoverTooltip(null);
  }, [clearSelection, clearFocusedNodes]);

  return {
    resetGraphInteraction,
    fitView,
    selectNodeByIndex,
    tooltips,
    hoverTooltip,
    highlightSearchResults,
    highlightResultHover,
    startDragFromTooltip,
    addToFocusedNodes,
    removeFromFocusedNodes,
    clearFocusedNodes,
  };
}
