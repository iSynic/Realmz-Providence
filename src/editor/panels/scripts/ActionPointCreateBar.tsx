import { Copy, Plus } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { actionPointCapacity } from "../../actionPointCapacity";
import type { Project, TriggerRecord } from "../../types";
import { NumberField } from "./NumberField";

const CREATE_AP_HELP =
  "Creates a map or dungeon Action Point at the chosen cell. Realmz stores these as fixed records, so Providence reuses empty slots instead of shifting later record IDs.";

export function ActionPointCreateBar({
  activeTabKind,
  projectMaps,
  selectedMap,
  selectedMapCapacity,
  selectedTrigger,
  newActionPoint,
  actionPointCreateTitle,
  onSetNewActionPoint,
  onCreateMap,
  onCreateActionPoint,
  onDuplicateTrigger
}: {
  activeTabKind: string;
  projectMaps: Project["maps"];
  selectedMap: Project["maps"][number] | null;
  selectedMapCapacity: ReturnType<typeof actionPointCapacity> | null;
  selectedTrigger: TriggerRecord | null;
  newActionPoint: { mapId: string; x: number; y: number };
  actionPointCreateTitle: string;
  onSetNewActionPoint: (value: { mapId: string; x: number; y: number }) => void;
  onCreateMap: () => void;
  onCreateActionPoint: () => void;
  onDuplicateTrigger: () => void;
}) {
  if (activeTabKind !== "action-points") return null;
  if (!selectedMap) {
    return (
      <div className="script-create-strip script-create-empty">
        <div>
          <strong>Create a map before adding Action Points</strong>
          <small>Map Action Points live on fixed land or dungeon records. Start with Land Level 0, then place the first Action Point at a cell.</small>
        </div>
        <button type="button" className="btn btn-primary btn-xs script-create-primary" onClick={onCreateMap}>
          <Plus size={12} /> New Land Level 0
        </button>
      </div>
    );
  }
  return (
    <div className="script-create-strip">
      <label className="script-create-map-field">
        <TutorialTip title="New Action Point" body={CREATE_AP_HELP} side="below"><span>Map</span></TutorialTip>
        <select value={newActionPoint.mapId} onChange={(event) => onSetNewActionPoint({ ...newActionPoint, mapId: event.currentTarget.value })}>
          {projectMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
        </select>
      </label>
      <NumberField label="X" value={newActionPoint.x} onCommit={(x) => onSetNewActionPoint({ ...newActionPoint, x: clampRealmzCoordinate(x) })} />
      <NumberField label="Y" value={newActionPoint.y} onCommit={(y) => onSetNewActionPoint({ ...newActionPoint, y: clampRealmzCoordinate(y) })} />
      <button type="button" className="btn btn-primary btn-xs script-create-primary" disabled={!selectedMapCapacity?.canCreate} title={actionPointCreateTitle} onClick={onCreateActionPoint}>
        <Plus size={12} /> Action Point
      </button>
      {selectedTrigger && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicateTrigger}><Copy size={12} /> Duplicate</button>
      )}
      <small className={selectedMapCapacity?.canCreate ? "script-capacity-note" : "script-capacity-note blocked"}>
        {selectedMapCapacity?.active ?? 0}/{selectedMapCapacity?.max ?? 100} active Action Point records
        {selectedMapCapacity?.reusable ? `, ${selectedMapCapacity.reusable} empty reusable slot(s)` : selectedMapCapacity?.canCreate ? ", next create will append a fixed record" : ". Clear selected Action Point to reuse this record."}
      </small>
    </div>
  );
}

function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}
