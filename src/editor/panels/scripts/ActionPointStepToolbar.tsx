import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CopyPlus, Save, X } from "lucide-react";

export function ActionPointStepToolbar({
  surfaceButton,
  selectedSlot,
  hasSelectedAction,
  selectedStepDirty,
  targetDrawerAvailable,
  targetDrawerOpen,
  onMove,
  onDuplicate,
  onClear,
  onToggleTargetDrawer,
  onApply
}: {
  surfaceButton: ReactNode;
  selectedSlot: number;
  hasSelectedAction: boolean;
  selectedStepDirty: boolean;
  targetDrawerAvailable: boolean;
  targetDrawerOpen: boolean;
  onMove: (slot: number) => void;
  onDuplicate: () => void;
  onClear: () => void;
  onToggleTargetDrawer: () => void;
  onApply: () => void;
}) {
  return (
    <>
      {surfaceButton}
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step up" aria-label="Move step up" disabled={selectedSlot === 0} onClick={() => onMove(selectedSlot - 1)}>
        <ArrowUp size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step down" aria-label="Move step down" disabled={selectedSlot === 7} onClick={() => onMove(selectedSlot + 1)}>
        <ArrowDown size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Duplicate step to next position" aria-label="Duplicate step to next position" disabled={!hasSelectedAction || selectedSlot === 7} onClick={onDuplicate}>
        <CopyPlus size={12} />
      </button>
      <button type="button" className="btn btn-danger btn-xs icon-only" title="Clear step" aria-label="Clear step" disabled={!hasSelectedAction && !selectedStepDirty} onClick={onClear}>
        <X size={12} />
      </button>
      {targetDrawerAvailable && (
        <button
          type="button"
          className={`btn btn-secondary btn-xs${targetDrawerOpen ? " active" : ""}`}
          title={targetDrawerOpen ? "Hide target details" : "Open the selected target details"}
          onClick={onToggleTargetDrawer}
        >
          Target
        </button>
      )}
      <button
        type="button"
        className={`btn btn-primary btn-xs script-apply-button${selectedStepDirty ? " is-dirty" : ""}`}
        title={selectedStepDirty ? "Apply this step to the script." : "This step is already applied."}
        disabled={!selectedStepDirty}
        onClick={onApply}
      >
        <Save size={12} /> Apply Step
      </button>
    </>
  );
}
