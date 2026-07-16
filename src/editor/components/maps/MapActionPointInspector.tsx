import { actionPointMarkerStateForTrigger, isSecretActionPointState, landCellSecretState } from "../../map/actionPointMarkers";
import type { LandCellSecretState, MapEntity, Project, ProjectCommand, SelectedEntity, TriggerRecord } from "../../types";
import { actionSlotEntityId, selectEntityFromId, triggerEntityId } from "../../utils";
import { InfoGrid } from "../InfoGrid";
import { TutorialTip } from "../TutorialTip";
import { SegmentedControl, type SegmentedControlOption } from "../../ui";
import { MapNumberField } from "./MapFormControls";

const MAP_SAME_AS_TRIGGER_DESTINATION_HELP =
  "This after-script destination exactly matches the trigger cell. Expand this section and edit Level/X/Y to make the destination separate.";
const LAND_CELL_SECRET_OPTIONS: ReadonlyArray<SegmentedControlOption<LandCellSecretState>> = [
  { value: "normal", label: "Normal" },
  { value: "hidden", label: "Hidden Secret" },
  { value: "revealed", label: "Revealed Secret" }
];

export function CellActionPointDetails({
  project,
  triggers,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  triggers: TriggerRecord[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  if (triggers.length === 0) return null;
  return (
    <details className="context-section cell-action-point-details" open>
      <summary><span>Action Points On This Cell</span><b>{triggers.length}</b></summary>
      <div className="selection-link-list">
        {triggers.map((trigger) => {
          const selected = selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source));
          const markerState = actionPointMarkerStateForTrigger(project, trigger);
          const steps = trigger.actions
            .filter((action) => action.code !== 0)
            .slice(0, 4)
            .map((action) => ({ slot: action.slot, summary: mapInspectorActionSummary(project, action) }));
          return (
            <article className="cell-action-card" key={trigger.id}>
              <div>
                <strong>Action Point {trigger.recordIndex}</strong>
                <small>{trigger.percent}% chance{trigger.targetX != null && trigger.targetY != null ? ` | sends to ${trigger.landid ?? 0}, ${trigger.targetX},${trigger.targetY}` : ""}</small>
                {trigger.levelType === "land" && markerState !== "normal" && markerState !== "none" && (
                  <small>{markerState === "secret" ? "Hidden Secret via land cell state" : "Revealed Secret via land cell state"}</small>
                )}
              </div>
              {steps.length > 0 ? (
                <ol>
                  {steps.map((step) => <li key={`${trigger.id}:${step.slot}`}>{step.slot}. {step.summary}</li>)}
                </ol>
              ) : (
                <p className="empty-copy compact">No active steps.</p>
              )}
              <div className="link-chip-group">
                <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>Select</button>
                <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>Open in AP</button>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}

export function LandCellSecretEditor({
  map,
  cell,
  onApplyCommand
}: {
  map: MapEntity;
  cell: { x: number; y: number; tile: number };
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const state = landCellSecretState(cell.tile);
  return (
    <section className="map-authoring-group land-cell-secret-editor" aria-label="Land cell secret state">
      <h4>Secret Area</h4>
      <SegmentedControl
        className="land-cell-secret-control"
        ariaLabel="Secret area state"
        value={state}
        options={LAND_CELL_SECRET_OPTIONS}
        onChange={(nextState) => onApplyCommand({
          kind: "setLandCellSecretState",
          label: `Set land cell ${LAND_CELL_SECRET_OPTIONS.find((option) => option.value === nextState)?.label ?? nextState}`,
          mapId: map.id,
          x: cell.x,
          y: cell.y,
          state: nextState
        })}
      />
      <small>{state === "hidden" ? "Undetected until Realmz reveals this cell." : state === "revealed" ? "Stored as already detected." : "Ordinary land cell state."}</small>
    </section>
  );
}

export function TriggerSelectionDetails({
  project,
  trigger,
  onApplyCommand,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const isActionPoint = trigger.source !== "Data ED3" && trigger.levelType && trigger.levelIndex != null;
  const markerState = actionPointMarkerStateForTrigger(project, trigger);
  const secret = isSecretActionPointState(markerState);
  const move = (patch: Partial<{ x: number; y: number }>) => {
    const levelType = trigger.levelType;
    const levelIndex = trigger.levelIndex;
    if (!isActionPoint || !trigger.coordinate || !levelType || levelIndex == null) return;
    onApplyCommand({
      kind: "moveActionPoint",
      label: "Move Action Point",
      triggerId: trigger.id,
      levelType,
      levelIndex,
      x: patch.x ?? trigger.coordinate.x,
      y: patch.y ?? trigger.coordinate.y
    });
  };
  const destinationMatchesTrigger = Boolean(
    isActionPoint &&
    trigger.coordinate &&
    trigger.landid === trigger.levelIndex &&
    trigger.targetX === trigger.coordinate.x &&
    trigger.targetY === trigger.coordinate.y
  );
  return (
    <div className="map-trigger-editor">
      <section className="map-authoring-group map-trigger-summary" aria-label="Action point summary">
        <h4>{trigger.source === "Data ED3" ? "Extra Action Point" : "Action Point"} {trigger.recordIndex}</h4>
        <InfoGrid
          rows={[
            ["Record", `${trigger.source} #${trigger.recordIndex}`],
            ["Type", secret ? markerState === "revealed-secret" ? "Revealed Secret Action Point" : "Secret Action Point" : "Action Point"],
            ["Chance", `${trigger.percent}%`],
            ["Steps", `${trigger.actions.filter((action) => action.code !== 0 || action.id !== 0).length}/8 filled`]
          ]}
        />
      </section>
      {isActionPoint && (
        <div className="context-action-stack">
          <button
            className="btn btn-primary btn-xs context-action-button context-action-button-narrow"
            type="button"
            onClick={() => onOpenScripts(selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)))}
          >
            Open in Scripts/AP
          </button>
        </div>
      )}
      {isActionPoint && trigger.coordinate && (
        <div className="map-authoring-form">
          <section className="map-authoring-group" aria-label="Trigger Location">
            <h4>Trigger Location</h4>
            <div className="map-authoring-fields two-column">
              <MapNumberField label="X" value={trigger.coordinate.x} min={0} max={89} compact plain maxLength={2} commitOnChange onCommit={(x) => move({ x })} />
              <MapNumberField label="Y" value={trigger.coordinate.y} min={0} max={89} compact plain maxLength={2} commitOnChange onCommit={(y) => move({ y })} />
            </div>
          </section>
          <section className="map-authoring-group" aria-label="Activation">
            <h4>Activation</h4>
            <MapNumberField label="% Chance" value={trigger.percent} min={0} max={100} compact plain maxLength={3} onCommit={(percent) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point chance", triggerId: trigger.id, fields: { percent } })} />
            {trigger.levelType === "land" ? (
              <small className="map-ap-secret-status">
                {markerState === "secret" ? "Hidden Secret via land cell state." : markerState === "revealed-secret" ? "Revealed Secret via land cell state." : "Normal land cell. Edit Secret Area in the map Selection Inspector."}
              </small>
            ) : (
              <small className="map-ap-dungeon-secret-status">
                {secret ? "Secret via this cell's Allow Move directions." : "Paint Allow Move directions in Dungeon Draw to make this cell secret."}
              </small>
            )}
            {markerState === "revealed-secret" && (
              <small className="map-ap-marker-status">
                {trigger.levelType === "land" ? "Stored as already detected in the land cell." : "Stored with Realmz's already-revealed runtime marker."}
              </small>
            )}
          </section>
          <details className="map-authoring-group map-authoring-destination" open={!destinationMatchesTrigger}>
            <summary>
              <span>After Script Destination</span>
              {destinationMatchesTrigger && (
                <TutorialTip title="Same As Trigger" body={MAP_SAME_AS_TRIGGER_DESTINATION_HELP} side="below">
                  <small>Same as trigger</small>
                </TutorialTip>
              )}
            </summary>
            <div className="map-authoring-fields three-column">
              <MapNumberField label="Level" value={trigger.landid ?? 0} min={0} max={255} compact plain maxLength={3} onCommit={(landid) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target level", triggerId: trigger.id, fields: { landid } })} />
              <MapNumberField label="X" value={trigger.targetX ?? 0} min={0} max={89} compact plain maxLength={2} onCommit={(targetX) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target X", triggerId: trigger.id, fields: { targetX } })} />
              <MapNumberField label="Y" value={trigger.targetY ?? 0} min={0} max={89} compact plain maxLength={2} onCommit={(targetY) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target Y", triggerId: trigger.id, fields: { targetY } })} />
            </div>
          </details>
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onApplyCommand({ kind: "deleteTrigger", label: "Clear Action Point", triggerId: trigger.id })}>
            Clear to reusable slot
          </button>
        </div>
      )}
      <ActionPointStepTable project={project} trigger={trigger} onSelectEntity={onSelectEntity} />
    </div>
  );
}

function ActionPointStepTable({
  project,
  trigger,
  onSelectEntity
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <section className="map-authoring-group map-action-steps" aria-label="Action point steps">
      <h4>Steps</h4>
      <div className="map-linked-step-table">
        <div className="map-linked-step-head">
          <span>Step</span>
          <span>Code</span>
          <span>ID</span>
          <span>Action</span>
        </div>
        {Array.from({ length: 8 }, (_, step) => {
          const action = trigger.actions.find((candidate) => candidate.slot === step);
          const label = action ? mapInspectorActionSummary(project, action) : "Empty";
          return (
            <button
              key={step}
              className={action ? "filled" : ""}
              type="button"
              onClick={() => onSelectEntity(selectEntityFromId(actionSlotEntityId(trigger, step)))}
            >
              <span>{step}</span>
              <span>{action?.rawCode ?? 0}{action?.gosub ? "*" : ""}</span>
              <span>{action?.id ?? 0}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function mapInspectorActionSummary(project: Project | null, action: TriggerRecord["actions"][number]) {
  const message = messageTargetPreview(project, action);
  if (message) {
    const text = message.text ? `: "${truncateMapInspectorText(message.text, 80)}"` : "";
    return `Show Message ${message.id}${message.noWait ? " · no wait" : ""}${text}`;
  }
  if (action.code === 0) return "Empty step";
  return `${action.label}${action.id ? ` ${action.id}` : ""}`;
}

function messageTargetPreview(project: Project | null, action: TriggerRecord["actions"][number]) {
  if (action.code !== 1 || action.id === 0) return null;
  const id = Math.abs(action.id);
  const record = project?.messages?.find((candidate) => candidate.id === id);
  return {
    id,
    noWait: action.id < 0,
    text: record?.text?.trim() ?? ""
  };
}

function truncateMapInspectorText(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}
