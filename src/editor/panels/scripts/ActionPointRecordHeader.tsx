import type { ReactNode } from "react";
import { Copy, Eye, Trash2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { ScriptDiagnostic } from "../../scriptValidation";
import type { LevelType, MapCoordinateTarget, Project, TriggerRecord } from "../../types";
import { NumberField } from "./NumberField";
import { ScriptDiagnostics } from "./ScriptDiagnostics";

const SCRIPT_RECORD_HELP =
  "This selected record is the source-backed script container. Map Action Points have chance/location/goto fields; Extra Action Points store only the eight steps until another script calls them.";
const SCRIPT_DESCRIPTOR_HELP =
  "Optional project-only description for Providence authors. Realmz does not store or consume it; the canonical Action Point number and coordinates remain the record identity.";
const CLEAR_SCRIPT_HELP =
  "Clear keeps Realmz's fixed record shape intact. Clearing a map Action Point makes the slot reusable; deleting an Extra Action Point uses the safe row command for that reusable script.";
const SAME_AS_TRIGGER_DESTINATION_HELP =
  "This after-script destination exactly matches the trigger cell, so Providence shows it as a read-only mirror here. To make it separate, select this Action Point on Maps, expand After Script Destination, and edit Level/X/Y there.";

export function ActionPointRecordHeader({
  trigger,
  identity,
  descriptor,
  isMacro,
  deleteMacroLabel,
  diagnostics,
  macroContextCard,
  markerState,
  isSecret,
  projectMaps,
  moveMapKey,
  afterScriptMaps,
  afterScriptMapKey,
  destinationMatchesTrigger,
  triggerLocationTarget,
  afterScriptTarget,
  onRename,
  onDuplicate,
  onClear,
  onUpdateHeader,
  onMoveActionPoint,
  onOpenMapCoordinate
}: {
  trigger: TriggerRecord;
  identity: string;
  descriptor: string;
  isMacro: boolean;
  deleteMacroLabel: string;
  diagnostics: ScriptDiagnostic[];
  macroContextCard?: ReactNode;
  markerState: string;
  isSecret: boolean;
  projectMaps: Project["maps"];
  moveMapKey: string;
  afterScriptMaps: Project["maps"];
  afterScriptMapKey: string;
  destinationMatchesTrigger: boolean;
  triggerLocationTarget: MapCoordinateTarget | null;
  afterScriptTarget: MapCoordinateTarget | null;
  onRename: (displayName: string) => void;
  onDuplicate: () => void;
  onClear: () => void;
  onUpdateHeader: (label: string, fields: Partial<Pick<TriggerRecord, "percent" | "landid" | "targetX" | "targetY">>) => void;
  onMoveActionPoint: (fields: Partial<{ levelType: LevelType; levelIndex: number; x: number; y: number }>) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
}) {
  return (
    <>
      <div className="script-record-header">
        <div className="script-record-heading">
          <TutorialTip title="Selected Script Record" body={SCRIPT_RECORD_HELP} side="below">
            <strong className="script-record-identity">{identity}</strong>
          </TutorialTip>
          <label className="script-name-field">
            <TutorialTip title="Descriptor" body={SCRIPT_DESCRIPTOR_HELP} side="below"><span>Descriptor</span></TutorialTip>
            <input
              key={`${trigger.id}:${descriptor}`}
              defaultValue={descriptor}
              placeholder="Optional project-only description"
              onBlur={(event) => {
                const displayName = event.currentTarget.value.trim();
                if (displayName !== descriptor) onRename(displayName);
              }}
            />
          </label>
        </div>
        <div className="script-record-actions">
          <button className="btn btn-secondary btn-xs" type="button" onClick={onDuplicate}><Copy size={12} /> Duplicate</button>
          <TutorialTip title={isMacro ? "Delete Extra Action Point" : "Clear Action Point"} body={CLEAR_SCRIPT_HELP} side="below">
            <button
              className="btn btn-danger btn-xs"
              type="button"
              title={isMacro ? "Delete this Extra Action Point" : "Clear this Action Point record so it can be reused"}
              onClick={onClear}
            >
              <Trash2 size={12} /> {isMacro ? deleteMacroLabel : "Clear Action Point"}
            </button>
          </TutorialTip>
        </div>
      </div>
      <ScriptDiagnostics issues={diagnostics} />
      {isMacro ? macroContextCard : (
        <div className="script-header-grid">
          <section className="script-header-group script-header-chance" aria-label="Activation Chance">
            <h4>Activation</h4>
            <NumberField label="%" value={trigger.percent} onCommit={(percent) => onUpdateHeader("Update action chance", { percent })} />
            {trigger.levelType === "land" ? (
              <small className="script-ap-secret-status">
                {markerState === "secret" ? "Hidden Secret via land cell state" : markerState === "revealed-secret" ? "Revealed Secret via land cell state" : "Normal land cell; edit Secret Area in Maps"}
              </small>
            ) : (
              <small className="script-ap-dungeon-secret-status">
                {isSecret ? "Secret via Dungeon Allow Move flags" : "Dungeon Draw controls Secret directions"}
              </small>
            )}
            {markerState === "revealed-secret" && <small className="script-ap-marker-status">Already revealed</small>}
          </section>
          <section className="script-header-group script-header-location" aria-label="Trigger Location">
            <div className="script-header-title-row"><h4>Trigger Location</h4></div>
            <div className="script-header-fields">
              <label className="script-header-map-field script-header-inline-field">
                <span>Map</span>
                <select
                  value={moveMapKey}
                  onChange={(event) => {
                    const [levelType, levelIndex] = event.currentTarget.value.split(":");
                    onMoveActionPoint({ levelType: levelType as LevelType, levelIndex: Number(levelIndex) });
                  }}
                >
                  {projectMaps.map((map) => <option key={map.id} value={`${map.levelType}:${map.index}`}>{map.name}</option>)}
                </select>
              </label>
              <NumberField label="X" value={trigger.coordinate?.x ?? trigger.targetX ?? 0} onCommit={(x) => onMoveActionPoint({ x })} />
              <NumberField label="Y" value={trigger.coordinate?.y ?? trigger.targetY ?? 0} onCommit={(y) => onMoveActionPoint({ y })} />
              <MapCoordinateJumpButton target={triggerLocationTarget} maps={projectMaps} label="Open trigger location on Maps" onOpenMapCoordinate={onOpenMapCoordinate} />
            </div>
          </section>
          <section className={`script-header-group script-header-destination${destinationMatchesTrigger ? " is-same" : ""}`} aria-label="After Script Destination">
            <div className="script-header-title-row">
              <div className="script-header-summary-label">
                <h4>After Script Destination</h4>
                {destinationMatchesTrigger && (
                  <TutorialTip title="Same As Trigger" body={SAME_AS_TRIGGER_DESTINATION_HELP} side="below"><small>Same as trigger</small></TutorialTip>
                )}
              </div>
            </div>
            <div className="script-header-fields">
              <label className="script-header-map-field script-header-inline-field">
                <span>Map</span>
                <select
                  value={afterScriptMapKey}
                  disabled={destinationMatchesTrigger}
                  onChange={(event) => {
                    const [, levelIndex] = event.currentTarget.value.split(":");
                    onUpdateHeader("Update action target level", { landid: Number(levelIndex) });
                  }}
                >
                  {afterScriptMaps.map((map) => <option key={map.id} value={`${map.levelType}:${map.index}`}>{map.name}</option>)}
                </select>
              </label>
              <NumberField label="X" value={trigger.targetX ?? 0} disabled={destinationMatchesTrigger} onCommit={(targetX) => onUpdateHeader("Update action target X", { targetX })} />
              <NumberField label="Y" value={trigger.targetY ?? 0} disabled={destinationMatchesTrigger} onCommit={(targetY) => onUpdateHeader("Update action target Y", { targetY })} />
              <MapCoordinateJumpButton target={afterScriptTarget} maps={projectMaps} label="Open after-script destination on Maps" onOpenMapCoordinate={onOpenMapCoordinate} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MapCoordinateJumpButton({
  target,
  maps,
  label,
  onOpenMapCoordinate
}: {
  target: MapCoordinateTarget | null;
  maps: Project["maps"];
  label: string;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
}) {
  const map = target ? maps.find((candidate) => candidate.levelType === target.levelType && candidate.index === target.levelIndex) ?? null : null;
  const title = target
    ? map ? `${label}: ${map.name} ${target.x}, ${target.y}` : `No ${target.levelType} level ${target.levelIndex} exists for ${target.x}, ${target.y}.`
    : "No map coordinate is selected.";
  return (
    <button
      type="button"
      className="btn btn-secondary btn-xs icon-only script-coordinate-jump"
      title={title}
      aria-label={title}
      disabled={!target || !map || !onOpenMapCoordinate}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!target || !map) return;
        onOpenMapCoordinate?.(target);
      }}
    >
      <Eye size={12} />
    </button>
  );
}
