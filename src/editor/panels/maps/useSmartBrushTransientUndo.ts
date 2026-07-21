import { useEffect } from "react";
import type { TransientUndoScope } from "../../app/transientUndo";
import type { MapWorkbenchState } from "./useMapWorkbenchState";

export function useSmartBrushTransientUndo(
  workbench: MapWorkbenchState,
  onSetTransientUndoScope: (scope: TransientUndoScope | null) => void
) {
  const {
    paint: { paintMode },
    smartBrush: { canUndoSmartBrushMaskStep, undoSmartBrushMaskStep }
  } = workbench;

  useEffect(() => {
    if (paintMode !== "smart" || !canUndoSmartBrushMaskStep) {
      onSetTransientUndoScope(null);
      return;
    }
    onSetTransientUndoScope({ label: "Smart Brush mask stroke", undo: undoSmartBrushMaskStep });
    return () => onSetTransientUndoScope(null);
  }, [canUndoSmartBrushMaskStep, onSetTransientUndoScope, paintMode, undoSmartBrushMaskStep]);
}
