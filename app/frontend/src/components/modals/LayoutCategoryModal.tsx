import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Orbit, LayoutTemplate, Info, Check } from "lucide-react";
import type { LayoutType, LayoutOverrides } from "../../graph/api/graphs";

const DEFAULT_CATEGORY_OPTIONS = [
  { key: "cellular_component", label: "Cellular Component" },
  { key: "molecular_function", label: "Molecular Function" },
  { key: "biological_process", label: "Biological Process" },
];

function toCategoryLabel(key: string): string {
  return key
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

interface LayoutCategoryModalProps {
  open: boolean;
  showCategory?: boolean;
  fileName?: string;
  categories?: string[];
  currentCategory?: string | null;
  showTuning?: boolean;
  initialOverrides?: LayoutOverrides;
  onCancel: () => void;
  onConfirm: (layoutType: LayoutType, category?: string, overrides?: LayoutOverrides) => void;
}

const LayoutCategoryModal: React.FC<LayoutCategoryModalProps> = ({
  open,
  showCategory = false,
  fileName,
  categories,
  currentCategory,
  onCancel,
  onConfirm,
  showTuning = false,
  initialOverrides,
}) => {
  const [layoutType, setLayoutType] = useState<LayoutType>("cpp");
  const [overrides, setOverrides] = useState<LayoutOverrides>({});
  const [category, setCategory] = useState<string | null>(null);

  const categoryOptions =
    categories && categories.length > 0
      ? categories.map((key) => ({ key, label: toCategoryLabel(key) }))
      : DEFAULT_CATEGORY_OPTIONS;

  useEffect(() => {
    if (open) {
      setLayoutType("cpp");
      setCategory(currentCategory ?? null);
      setOverrides(initialOverrides ?? {});
    }
  }, [open, currentCategory, initialOverrides]);

  if (!open) return null;

  const canConfirm = !showCategory || Boolean(category);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(layoutType, category ?? undefined, showTuning ? overrides : undefined);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="
          fixed inset-0 z-1000 flex items-center justify-center backdrop-blur-sm
          bg-black/30 dark:bg-black/70
        "
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
          className="
            relative w-[min(96vw,640px)]
            max-h-[85vh] overflow-y-auto
            rounded-2xl border
            shadow-2xl
            p-5
            flex flex-col

            border-black/10
            bg-white/95
            text-gray-900
            shadow-black/10

            dark:border-white/10
            dark:bg-linear-to-b dark:from-zinc-900/95 dark:to-zinc-950/95
            dark:text-gray-100
            dark:shadow-black/80
          "
        >
          {/* Close */}
          <button
            type="button"
            onClick={onCancel}
            className="
              absolute right-3 top-3 z-20
              inline-flex h-8 w-8 items-center justify-center
              rounded-full transition

              bg-black/5 text-gray-600
              hover:bg-black/10 hover:text-gray-900

              dark:bg-white/5 dark:text-gray-400
              dark:hover:bg-white/10 dark:hover:text-white
            "
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="mb-4 pr-10">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Choose layout type
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
              <Info size={12} className="mt-px text-gray-500 dark:text-gray-500" />
              Select how the graph should be arranged on the canvas. You can change
              the layout later from the graph's change-view dialog.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-xs">
            {/* C++ layout card */}
            <button
              type="button"
              onClick={() => setLayoutType("cpp")}
              className={`
                group relative w-full text-left rounded-xl border px-3.5 py-3
                flex flex-col gap-2
                transition
                ${
                  layoutType === "cpp"
                    ? `
                      border-blue-600/50 bg-blue-600/10
                      shadow-[0_0_0_1px_rgba(37,99,235,0.20)]
                      dark:border-blue-500/70 dark:bg-blue-600/15 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.4)]
                    `
                    : `
                      border-black/10 bg-black/2 hover:border-blue-600/30 hover:bg-blue-600/5
                      dark:border-white/10 dark:bg-black/20 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/5
                    `
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <div
                    className="
                      inline-flex h-8 w-8 items-center justify-center rounded-full
                      bg-blue-600/10 text-blue-700
                      dark:bg-blue-600/20 dark:text-blue-300
                    "
                  >
                    <LayoutTemplate size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-900 dark:text-white">
                      Hierarchical layout
                    </div>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      Emphasizes hierarchy, reduces edge crossings
                    </div>
                  </div>
                </div>

                <span
                  className={`
                    text-[10px] px-2 py-0.5 rounded-full border
                    ${
                      layoutType === "cpp"
                        ? `
                          border-blue-600/35 bg-blue-600/10 text-blue-800
                          dark:border-blue-400/80 dark:bg-blue-500/20 dark:text-blue-100
                        `
                        : `
                          border-black/10 text-gray-700 bg-black/2
                          dark:border-white/15 dark:text-gray-300 dark:bg-white/5
                        `
                    }
                  `}
                >
                  Recommended
                </span>
              </div>

              <ul className="mt-1.5 space-y-1 text-[10px] text-gray-700 dark:text-gray-300">
                <li>• Uses the C++ backend layout algorithm.</li>
                <li>• Emphasizes DAG hierarchy and reduces edge crossings.</li>
                <li>• Best for exploring large DAGs (especially Gene Ontology) and identifying distinct subgraphs.</li>
              </ul>
            </button>

            {/* Radial layout card */}
            <button
              type="button"
              onClick={() => setLayoutType("radial")}
              className={`
                group relative w-full text-left rounded-xl border px-3.5 py-3
                flex flex-col gap-2
                transition
                ${
                  layoutType === "radial"
                    ? `
                      border-purple-600/45 bg-purple-600/10
                      shadow-[0_0_0_1px_rgba(147,51,234,0.18)]
                      dark:border-purple-500/70 dark:bg-purple-600/15 dark:shadow-[0_0_0_1px_rgba(168,85,247,0.4)]
                    `
                    : `
                      border-black/10 bg-black/2 hover:border-purple-600/30 hover:bg-purple-600/5
                      dark:border-white/10 dark:bg-black/20 dark:hover:border-purple-500/50 dark:hover:bg-purple-500/5
                    `
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <div
                    className="
                      inline-flex h-8 w-8 items-center justify-center rounded-full
                      bg-purple-600/10 text-purple-700
                      dark:bg-purple-600/20 dark:text-purple-300
                    "
                  >
                    <Orbit size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-900 dark:text-white">
                      Radial layout
                    </div>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      Root in the center, levels as rings
                    </div>
                  </div>
                </div>
              </div>

              <ul className="mt-1.5 space-y-1 text-[10px] text-gray-700 dark:text-gray-300">
                <li>• Places the root node in the middle.</li>
                <li>• Children are arranged on concentric circles.</li>
                <li>• Good for smaller graphs or quick “overview from root”.</li>
              </ul>
            </button>
          </div>

          {showCategory && (
            <div className="pt-4 border-t border-black/10 dark:border-white/10">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Choose category
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {fileName ? (
                    <>
                      Select the ontology namespace to load from{" "}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {fileName}
                      </span>
                      .
                    </>
                  ) : (
                    "Select the ontology namespace (category) for this graph."
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {categoryOptions.map(({ key, label }) => {
                  const isSelected = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCategory(key);
                        setOverrides(key === currentCategory ? initialOverrides ?? {} : {});
                      }}
                      className={`
                        inline-flex items-center gap-1
                        px-2.5 py-1 rounded-full border
                        text-[11px] font-medium leading-tight transition
                        ${
                          isSelected
                            ? `
                              border-blue-600/50 bg-blue-600/10 text-blue-800
                              dark:border-blue-500/70 dark:bg-blue-600/15 dark:text-blue-100
                            `
                            : `
                              border-black/10 bg-black/2 text-gray-700 hover:border-blue-600/30 hover:bg-blue-600/5
                              dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-blue-500/40 dark:hover:bg-white/10
                            `
                        }
                      `}
                    >
                      {isSelected && <Check size={11} className="shrink-0" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showTuning && layoutType === "cpp" && (
            <fieldset className="mb-4 space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
              <legend className="px-1 text-sm font-semibold">Layout settings</legend>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                100% uses the ontology preset. Changes take effect when you apply them.
              </p>
              {([
                ["box_width_coeff", "Layout width"],
                ["min_required_distance_between_adjacent_levels", "Minimum level spacing"],
                ["nested_colour_child_padding", "Subgroup spacing"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-xs">
                  <span className="mb-2 flex justify-between">
                    <span>{label}</span>
                    <output htmlFor={`layout-${key}`}>{Math.round((overrides[key] ?? 1) * 100)}%</output>
                  </span>
                  <input
                    id={`layout-${key}`}
                    type="range"
                    min={50}
                    max={200}
                    step={5}
                    value={Math.round((overrides[key] ?? 1) * 100)}
                    onChange={(event) => setOverrides((previous) => ({
                      ...previous, [key]: Number(event.target.value) / 100,
                    }))}
                    className="w-full accent-blue-600"
                  />
                </label>
              ))}
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Wide graphs may need more level spacing automatically.
                Subgroup spacing affects nested groups only.
              </p>
              <button type="button" onClick={() => setOverrides({})}
                className="text-xs font-medium text-blue-700 underline dark:text-blue-300">
                Restore ontology preset
              </button>
            </fieldset>
          )}

          {/* Footer / actions */}
          <div className="mt-2 flex justify-end gap-2 pt-2 border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={onCancel}
              className="
                inline-flex items-center gap-1.5
                rounded-lg px-3 py-1.5
                text-xs font-medium transition
                border border-black/10 bg-black/4 text-gray-700 hover:bg-black/8

                dark:border-transparent dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10
              "
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`
                inline-flex items-center gap-1.5
                rounded-lg px-3 py-1.5
                text-xs font-medium
                transition
                ${
                  canConfirm
                    ? "bg-blue-600/90 text-white hover:bg-blue-500"
                    : "bg-black/10 text-gray-500 cursor-not-allowed dark:bg-white/10 dark:text-gray-500"
                }
              `}
            >
              {showTuning ? "Apply" : "Confirm"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LayoutCategoryModal;
