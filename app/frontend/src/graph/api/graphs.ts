import { API_BASE, fetchJson } from "./base";
import type { CommentItem } from "../../hooks/useComments";

export type LayoutType = "cpp" | "radial";

export type LayoutOverrides = {
  box_width_coeff?: number;
  min_required_distance_between_adjacent_levels?: number;
  nested_colour_child_padding?: number;
};

export type LoadedGraph = {
  layout_overrides?: LayoutOverrides;
  graph_hash?: string;
  uuid: string;
  canvas_positions: number[];
  links: number[];
  names?: string[];
  meta?: Record<string, unknown>;
  config?: {
    point_size?: number;
    favorites?: number[];
    comments?: CommentItem[];
  };
  fallback_used?: boolean;
  categories?: string[] | null;
  current_category?: string | null;
};

export type ChangeCategoryResult = {
  layout_overrides?: LayoutOverrides;
  uuid: string;
  canvas_positions: number[];
  links: number[];
  names?: string[];
  space_size?: number;
  fallback_used?: boolean;
  category: string;
};

export type GraphProgressEvent = {
  stage: string;
  message: string;
};

export async function loadGraphByHash(hash: string) {
  return fetchJson<LoadedGraph>(`${API_BASE}/load_graph/${hash}`);
}

export async function exportGraph(uuid: string) {
  return fetchJson<any>(`${API_BASE}/export_graph/${uuid}`);
}

export async function analyzeGraph(uuid: string | null) {
  if (!uuid) throw new Error("No graph uuid");
  return fetchJson<any>(`${API_BASE}/analyze_graph/${uuid}`, { method: "POST" });
}

export async function loadGraphFromJson(file: File, layoutType: LayoutType) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("layout_type", layoutType);

  return fetchJson<LoadedGraph>(`${API_BASE}/load_graph_from_json`, {
    method: "POST",
    body: formData,
  });
}

export async function makeGraphStructure(
  file: File,
  rootNamespace: string,
  layoutType: LayoutType,
  onProgress?: (event: GraphProgressEvent) => void
): Promise<LoadedGraph> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("root", rootNamespace);
  formData.append("layout_type", layoutType);

  const response = await fetch(
    `${API_BASE}/flask_make_graph_structure`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(
      errorBody?.error ?? `Request failed with status ${response.status}`
    );
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let result: LoadedGraph | null = null;

  while (true) {
    const { value, done } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(line) as GraphProgressEvent & {
        data?: LoadedGraph;
      };

      onProgress?.({ stage: event.stage, message: event.message });

      if (event.stage === "error") {
        await reader.cancel().catch(() => {});
        throw new Error(event.message);
      }

      if (event.stage === "done" && event.data) {
        result = event.data;
      }
    }

    if (done) {
      break;
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    const event = JSON.parse(buffer) as GraphProgressEvent & {
      data?: LoadedGraph;
    };

    onProgress?.({ stage: event.stage, message: event.message });

    if (event.stage === "error") {
      await reader.cancel().catch(() => {});
      throw new Error(event.message);
    }

    if (event.stage === "done" && event.data) {
      result = event.data;
    }
  }

  if (!result) {
    throw new Error("Graph loading finished without result");
  }

  return result;
}

export async function recomputeLayout(graphUuid: string, layoutType: LayoutType, layoutOverrides?: LayoutOverrides) {
  return fetchJson<LoadedGraph>(`${API_BASE}/recompute_layout/${graphUuid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout_type: layoutType, layout_overrides: layoutOverrides }),
  });
}

export async function changeCategory(
  graphUuid: string,
  category: string,
  layoutType: LayoutType,
  layoutOverrides?: LayoutOverrides
) {
  return fetchJson<ChangeCategoryResult>(`${API_BASE}/change_category/${graphUuid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, layout_type: layoutType, layout_overrides: layoutOverrides }),
  });
}

export type SaveGraphBody = {
  canvas_positions: number[];
  links: number[];
  graph_hash: string | null;

  point_size: number | null;
  favorites: number[];
  comments: CommentItem[];

  group_name?: string;
  group_password?: string;
};

export async function saveGraphToDb(uuid: string | null, body: SaveGraphBody) {
  if (!uuid) throw new Error("No graph uuid");
  return fetchJson<{ hash: string }>(`${API_BASE}/save_graph/${uuid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateGraphConfig(hash: string, payload: any, signal?: AbortSignal) {
  return fetchJson<any>(`${API_BASE}/update_graph_config/${hash}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}
