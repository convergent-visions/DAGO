import React, { useState, useCallback, useEffect, useRef } from "react";
import { Star, MessageCirclePlus } from "lucide-react";
import { NodeInfoProps } from "../leftsidebar/NodeInfo";
import { useFavorites } from "../../hooks/useFavorites";
import { useComments } from "../../hooks/useComments";
import CommentModal from "../modals/CommentModal";

export interface ResultCardProps {
  node: NodeInfoProps;
  onSelect: (n: NodeInfoProps) => void;
  onHoverResultCard?: (node?: NodeInfoProps) => void;
}

const ResultCard: React.FC<ResultCardProps> = ({
  node,
  onSelect,
  onHoverResultCard,
}) => {
  const hoveredRef = useRef(false);
  const hoverCallbackRef = useRef(onHoverResultCard);
  hoverCallbackRef.current = onHoverResultCard;

  useEffect(() => () => {
    // Removing a favorite can unmount its card without a mouseleave event.
    if (hoveredRef.current) hoverCallbackRef.current?.();
  }, []);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { addComment } = useComments();

  const isFav = isFavorite(node.index!);
  const [commentOpen, setCommentOpen] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(node.index!);
  };

  const openComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentOpen(true);
  };

  const handleSubmitComment = useCallback(
    (data: { name: string; text: string }) => {
      setCommentOpen(false);
      addComment({ index: node.index, name: node.name }, data);
    },
    [addComment, node.index, node.name]
  );

  return (
    <>
      <li
        onClick={() => onSelect(node)}
        onMouseEnter={() => {
          hoveredRef.current = true;
          onHoverResultCard?.(node);
        }}
        onMouseLeave={() => {
          hoveredRef.current = false;
          onHoverResultCard?.();
        }}
        className="
          group rounded-xl p-3 border transition cursor-pointer
          shadow-sm hover:shadow-md w-[17em] max-w-full

          border-black/10 bg-white/70
          hover:bg-white hover:border-black/20

          dark:border-gray-900/60 dark:bg-white/3
          dark:hover:bg-white/6 dark:hover:border-gray-700
        "
      >
        <div className="flex items-start justify-between gap-3">
          {/* Text */}
          <div className="min-w-0 flex-1">
            <p
              className="
                font-semibold text-sm leading-tight line-clamp-2
                text-gray-900
                dark:text-gray-100
              "
              title={node.name}
            >
              {node.name}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {/* Add comment */}
            <button
              onClick={openComment}
              className="
                p-1.5 rounded-lg transition shrink-0
                focus:outline-none focus:ring-2

                text-gray-500 hover:text-blue-700 hover:bg-blue-600/10 focus:ring-blue-300
                dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-400/10 dark:focus:ring-blue-700
              "
              aria-label="Add comment"
              title="Add comment"
            >
              <MessageCirclePlus size={18} className="block" />
            </button>

            {/* Favorite */}
            <button
              onClick={handleToggle}
              className={`
                p-1.5 rounded-lg transition shrink-0
                focus:outline-none focus:ring-2

                focus:ring-black/20
                dark:focus:ring-gray-700

                ${
                  isFav
                    ? `
                      text-yellow-600 hover:bg-yellow-600/10
                      dark:text-yellow-400 dark:hover:bg-yellow-400/10
                    `
                    : `
                      text-gray-500 hover:bg-black/5 group-hover:text-gray-800
                      dark:text-gray-400 dark:hover:bg-gray-800/80 dark:group-hover:text-gray-200
                    `
                }
              `}
              aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
              title={isFav ? "Remove from favorites" : "Add to favorites"}
            >
              <Star
                size={18}
                className="block"
                fill={isFav ? "currentColor" : "none"}
                stroke="currentColor"
              />
            </button>
          </div>
        </div>
      </li>

      {/* Comment modal */}
      <CommentModal
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
        onSubmit={handleSubmitComment}
        title={`Comment for: ${node.name}`}
      />
    </>
  );
};

export default React.memo(ResultCard);
