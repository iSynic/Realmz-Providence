import { useMemo } from "react";
import { Eye } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { actionSlotEntitiesForTriggerRecord } from "../../semanticGraph";
import { actionOptionFor, isDispatcherNoopOpcode } from "../../realmzActions";
import type { Action, Ed3ReachabilityRow, LibraryCatalog, Project, SelectedEntity, SemanticEntity, TriggerRecord } from "../../types";
import { CollapsibleSection, FieldRow } from "../../ui";
import { linksFor, selectEntityFromId, semanticLabel } from "../../utils";
import { combatMacroContextBody, combatMacroContextLabel, combatMacroContextTitle, type CombatMacroContext } from "./actionPointPresentation";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "./scriptActionCatalog";
import { triggerSemanticSelectionId } from "./scriptInventory";

const TECHNICAL_DETAILS_HELP =
  "Technical Details shows the raw Realmz storage: source file, record index, door ID, selected slot, applied and draft CODE/ID, Action Settings storage row, dispatcher status, and semantic links.";
const FLOW_PREVIEW_HELP =
  "Flow Preview summarizes obvious branches, GOSUBs, Extra Action Point calls, choices, and logic paths. It is a navigation aid, not a full runtime interpreter.";

export function Ed3EvidenceDetails({ row }: { row: Ed3ReachabilityRow | null }) {
  if (!row) return <div className="ed3-evidence-details"><strong>Extra AP Evidence</strong><small>No semantic reachability row is available for this imported Extra Action Point.</small></div>;
  const rawSignature = row.rawSignature.length > 0 ? row.rawSignature.join(", ") : "empty";
  const evidence = row.evidence.length > 0 ? row.evidence.join(", ") : "none";
  return (
    <div className="ed3-evidence-details">
      <header><strong>Extra AP Evidence</strong><span>{row.reachable ? "source-backed" : "not source-reachable"}</span></header>
      <div className="ed3-evidence-grid">
        <FieldRow label="Classification" value={row.classification} />
        <FieldRow label="Root Type" value={row.rootType ?? "none"} />
        <FieldRow label="Incoming Refs" value={row.incomingRefs} />
        <FieldRow label="Occupied Steps" value={row.actionCount} />
        <FieldRow label="Raw Signature" value={rawSignature} />
        <FieldRow label="Evidence" value={evidence} />
      </div>
      <small>{row.promotionRule}</small>
    </div>
  );
}

export function SourceEvidence({
  project, trigger, selectedSlot, selectedAction, selectedDraft, selectedOption, selectedSlotEntity, selectedEdcdRowId, onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  selectedSlot: number;
  selectedAction?: Action;
  selectedDraft: { rawCode: number; id: number };
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedSlotEntity?: SemanticEntity;
  selectedEdcdRowId: number | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const triggerEntityIdValue = triggerSemanticSelectionId(trigger);
  const edcdUsage = selectedSlotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  const count = [trigger.source, selectedSlotEntity?.id, selectedEdcdRowId != null ? `edcd:${selectedEdcdRowId}` : null].filter(Boolean).length;
  return (
    <CollapsibleSection title="Technical Details" eyebrow="advanced" count={String(count)} density="compact" storageKey="scripts.sourceEvidence.open" defaultOpen={false}>
      <p className="field-help">
        <TutorialTip title="Technical Details" body={TECHNICAL_DETAILS_HELP} side="below"><span>Raw storage, CODE/ID, Action Settings storage row, dispatcher status, and semantic links.</span></TutorialTip>
      </p>
      <SourceEvidenceDetails
        project={project} trigger={trigger} triggerEntityIdValue={triggerEntityIdValue} selectedSlot={selectedSlot}
        selectedAction={selectedAction} selectedDraft={selectedDraft} selectedOption={selectedOption}
        selectedSlotEntity={selectedSlotEntity} selectedEdcdRowId={selectedEdcdRowId} edcdUsage={edcdUsage} onSelectEntity={onSelectEntity}
      />
    </CollapsibleSection>
  );
}

function SourceEvidenceDetails({
  project, trigger, triggerEntityIdValue, selectedSlot, selectedAction, selectedDraft, selectedOption,
  selectedSlotEntity, selectedEdcdRowId, edcdUsage, onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  triggerEntityIdValue: string;
  selectedSlot: number;
  selectedAction?: Action;
  selectedDraft: { rawCode: number; id: number };
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedSlotEntity?: SemanticEntity;
  selectedEdcdRowId: number | null;
  edcdUsage?: { summary?: string; rowId?: number; shape?: string };
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const semanticSlotEntity = useMemo(
    () => actionSlotEntitiesForTriggerRecord(project, trigger).find((entity) => Number(entity.summary.slot) === selectedSlot),
    [project, trigger, selectedSlot]
  );
  const resolvedSlotEntity = selectedSlotEntity ?? semanticSlotEntity;
  const resolvedEdcdUsage = (edcdUsage ?? resolvedSlotEntity?.summary.edcdUsage) as { summary?: string; rowId?: number; shape?: string } | undefined;
  const triggerLinks = linksFor(project, triggerEntityIdValue);
  const slotLinks = linksFor(project, resolvedSlotEntity?.id ?? null);
  return (
    <div className="script-source-evidence">
      <div className="realmz-raw-preview">
        <FieldRow label="Script Source" value={trigger.source} /><FieldRow label="Script Entity" value={triggerEntityIdValue} />
        <FieldRow label="Record Index" value={trigger.recordIndex} /><FieldRow label="Door ID" value={trigger.doorid} />
        <FieldRow label="Map" value={trigger.levelType != null ? `${trigger.levelType} ${trigger.levelIndex ?? 0}` : "Extra Action Point"} />
        <FieldRow label="Coordinate" value={trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "none"} />
        <FieldRow label="Selected Slot" value={selectedSlot} /><FieldRow label="Slot Entity" value={resolvedSlotEntity?.id ?? "draft-only"} />
        <FieldRow label="Applied CODE/ID" value={selectedAction ? `${selectedAction.rawCode} / ${selectedAction.id}` : "empty"} />
        <FieldRow label="Draft CODE/ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} /><FieldRow label="Opcode" value={selectedOption.label} />
        <FieldRow label="Dispatcher" value={isDispatcherNoopOpcode(selectedDraft.rawCode) ? "dispatcher no-op; Realmz ignores this CODE" : "has documented dispatcher behavior"} />
        <FieldRow label="Action Settings Row" value={selectedEdcdRowId != null ? `${selectedEdcdRowId}${resolvedEdcdUsage?.shape ? ` (${resolvedEdcdUsage.shape})` : ""}` : "none"} />
        <FieldRow label="Edit State" value={resolvedSlotEntity?.editState ?? "authored/draft"} />
      </div>
      {resolvedEdcdUsage?.summary && <p className="field-help">{resolvedEdcdUsage.summary}</p>}
      <EvidenceLinkGroup title="Script Links" project={project} links={[...triggerLinks.outgoing, ...triggerLinks.incoming]} onSelectEntity={onSelectEntity} />
      <EvidenceLinkGroup title="Slot Links" project={project} links={[...slotLinks.outgoing, ...slotLinks.incoming]} onSelectEntity={onSelectEntity} />
    </div>
  );
}

function EvidenceLinkGroup({ title, project, links, onSelectEntity }: {
  title: string;
  project: Project;
  links: ReturnType<typeof linksFor>["outgoing"];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="script-source-link-group"><strong>{title}</strong><div className="link-chip-row">
      {links.slice(0, 12).map((link) => <button key={link.id} className="link-chip" type="button" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>{link.kind}: {semanticLabel(project, link.to)}</button>)}
    </div></div>
  );
}

export function CombatMacroContextCard({ context, onSelectEntity }: { context: CombatMacroContext; onSelectEntity: (entity: SelectedEntity) => void }) {
  const positiveBattleRefs = context.references.filter((reference) => reference.kind === "battle" && reference.runnable === false);
  return (
    <div className={`combat-macro-context-card ${context.kind}`}>
      <header><div><strong>{combatMacroContextTitle(context)}</strong><small>{combatMacroContextLabel(context)}</small></div><span>{context.kind === "mixed" ? "battle + monster" : context.kind}</span></header>
      <p>{combatMacroContextBody(context)}</p>
      {context.references.length > 0 && <div className="combat-macro-reference-list">{context.references.slice(0, 12).map((reference) => (
        <button key={reference.key} type="button" className={reference.runnable === false ? "warning" : ""} title={reference.detail} disabled={!reference.entity} onClick={() => reference.entity && onSelectEntity(reference.entity)}>
          <strong>{reference.label}</strong><small>{reference.detail}</small>
        </button>
      ))}</div>}
      {positiveBattleRefs.length > 0 && <small className="field-warning">Positive battle macro imports are preserved, but Realmz's normal battle macro path uses negative Data BD values.</small>}
    </div>
  );
}

export function ScriptFlowPreview({ project, catalog, trigger, onSelectEntity }: {
  project: Project;
  catalog?: LibraryCatalog | null;
  trigger: TriggerRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const flowSteps = trigger.actions.filter((action) => action.rawCode !== 0).sort((a, b) => a.slot - b.slot).map((action) => ({
    action,
    definition: scriptActionDefinitionFor(action.rawCode),
    routes: scriptStepFlowRoutes(project, catalog, { rawCode: action.rawCode, id: action.id }, trigger.levelType),
    summary: scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id }, "Empty step", trigger.levelType)
  }));
  if (flowSteps.length === 0) return null;
  return (
    <div className="script-flow-preview" aria-label="Branch and Extra Action Point preview">
      <TutorialTip title="Flow Preview" body={FLOW_PREVIEW_HELP} side="below"><strong>Flow Preview</strong></TutorialTip>
      {flowSteps.map(({ action, definition, routes, summary }) => <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
        <span>{action.slot + 1}</span><p><b>{definition.shortLabel}</b><small>{routes[0]?.target ? `${routes[0].label}: ${routes[0].target.label}` : routes[0]?.detail || summary}</small></p>
        {routes[0]?.target && <button type="button" className="btn btn-secondary btn-xs icon-only" title={`Open ${routes[0].target.label}`} aria-label={`Open ${routes[0].target.label}`} onClick={() => onSelectEntity(selectEntityForFlowTarget(routes[0].target!))}><Eye size={12} /></button>}
      </div>)}
    </div>
  );
}

function selectEntityForFlowTarget(target: { targetKind: string; value: number }): SelectedEntity {
  if (target.targetKind === "macro") return selectEntityFromId(`macro:${target.value}`);
  if (target.targetKind === "simpleEncounter") return selectEntityFromId(`encounter:simple:${target.value}`);
  if (target.targetKind === "complexEncounter") return selectEntityFromId(`encounter:complex:${target.value}`);
  if (target.targetKind === "thiefEncounter") return selectEntityFromId(`thief:${target.value}`);
  if (target.targetKind === "timedEncounter") return selectEntityFromId(`time:${target.value}`);
  if (target.targetKind === "message") return selectEntityFromId(`message:${target.value}`);
  if (target.targetKind === "scrollingText") return selectEntityFromId(`resource:TEXT:${target.value}`);
  if (target.targetKind === "treasure") return selectEntityFromId(`treasure:${target.value}`);
  if (target.targetKind === "shop") return selectEntityFromId(`shop:${target.value}`);
  if (target.targetKind === "monster") return selectEntityFromId(`monster:${target.value}`);
  if (target.targetKind === "battle") return selectEntityFromId(`battle:${target.value}`);
  if (target.targetKind === "mapRecord") return selectEntityFromId(`map-record:${target.value}`);
  if (target.targetKind === "item") return selectEntityFromId(`item:${target.value}`);
  return selectEntityFromId(`${target.targetKind}:${target.value}`);
}
