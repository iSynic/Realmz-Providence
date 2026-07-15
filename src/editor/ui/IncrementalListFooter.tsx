import { useEffect, useState } from "react";
import "./IncrementalListFooter.css";

export type IncrementalListFooterProps = {
  visibleCount: number;
  totalCount: number;
  step?: number;
  noun: string;
  nounPlural?: string;
  disabled?: boolean;
  onShowMore: () => void;
};

export function useIncrementalListLimit(step: number, resetKey: unknown) {
  const [visibleLimit, setVisibleLimit] = useState(step);
  useEffect(() => setVisibleLimit(step), [resetKey, step]);
  return [visibleLimit, () => setVisibleLimit((limit) => limit + step)] as const;
}

export function IncrementalListFooter({
  visibleCount,
  totalCount,
  step,
  noun,
  nounPlural = `${noun}s`,
  disabled = false,
  onShowMore
}: IncrementalListFooterProps) {
  const hiddenCount = Math.max(0, totalCount - visibleCount);
  if (hiddenCount === 0) return null;
  const revealCount = Math.min(step ?? hiddenCount, hiddenCount);
  const collectionNoun = totalCount === 1 ? noun : nounPlural;

  return (
    <div className="workbench-incremental-list-footer">
      <small>
        {visibleCount.toLocaleString()} of {totalCount.toLocaleString()} {collectionNoun} shown
      </small>
      <button type="button" className="btn btn-secondary btn-xs" disabled={disabled} onClick={onShowMore}>
        Show {revealCount.toLocaleString()} More
      </button>
    </div>
  );
}
