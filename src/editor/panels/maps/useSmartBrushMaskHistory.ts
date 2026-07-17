import { useCallback, useState } from "react";
import { sameSmartBrushMask } from "../../map/smartBrushMask";
import type { SmartBrushMaskCell } from "../../types";

export function useSmartBrushMaskHistory() {
  const [smartBrushMask, setSmartBrushMask] = useState<SmartBrushMaskCell[]>([]);
  const [history, setHistory] = useState<SmartBrushMaskCell[][]>([]);

  const commitSmartBrushMaskStep = (before: SmartBrushMaskCell[], after: SmartBrushMaskCell[]) => {
    setSmartBrushMask(after);
    if (!sameSmartBrushMask(before, after)) setHistory((entries) => [...entries, before].slice(-100));
  };
  const undoSmartBrushMaskStep = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setSmartBrushMask(previous);
    setHistory((entries) => entries.slice(0, -1));
  };
  const resetSmartBrushMask = useCallback(() => {
    setSmartBrushMask([]);
    setHistory([]);
  }, []);

  return {
    smartBrushMask,
    setSmartBrushMask,
    commitSmartBrushMaskStep,
    canUndoSmartBrushMaskStep: history.length > 0,
    undoSmartBrushMaskStep,
    resetSmartBrushMask
  };
}
