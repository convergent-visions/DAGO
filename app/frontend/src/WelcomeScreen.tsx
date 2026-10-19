import React from "react";
import { Network, Upload } from "lucide-react";

interface WelcomeScreenProps {
  onLoadClick: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLoadClick }) => {

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div
        className="
          w-[min(90vw,520px)]
          rounded-2xl border border-black/10
          bg-white/90 p-8 text-center shadow-xl backdrop-blur
          dark:border-white/10 dark:bg-zinc-950/90
        "
      >
        <div className="mb-5 flex justify-center">
          <div
            className="
              flex h-14 w-14 items-center justify-center
              rounded-2xl bg-black/5 dark:bg-white/10
            "
          >
            <Network size={30} />
          </div>
        </div>

        <h1 className="text-2xl font-semibold">
          DAGO
        </h1>

        <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Directed Acyclic Graph Visualizer
        </p>

        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Load a graph to visualize, explore and analyze its structure.
        </p>

        <button
          type="button"
          onClick={onLoadClick}
          className="
            mt-6 inline-flex items-center gap-2 rounded-xl
            bg-blue-600 px-5 py-2.5
            text-sm font-medium text-white
            transition hover:bg-blue-500
          "
        >
          <Upload size={17} />
          Load graph
        </button>
        
      </div>
    </div>
  );
};

export default WelcomeScreen;