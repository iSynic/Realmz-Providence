import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type {
  EditorTab,
  LibraryCatalog,
  Project,
  ProjectCommand,
  RealmzTargetRecordKind,
  SelectedEntity
} from "../../types";
import { ScrollArea, WorkbenchTabs, type WorkbenchTabOption } from "../../ui";
import { selectEntityFromId } from "../../utils";
import { TargetRecordEditor } from "../scripts/TargetRecordEditor";

const SIMPLE_ENCOUNTER_HELP = "Simple Encounters are source Data ED records with a prompt, four choice text buffers, back-out behavior, attempt fields, and four result action rows.";
const COMPLEX_ENCOUNTER_HELP = "Complex Encounters are source Data ED2 records with spell, item, thief, typed-word, and action-picker branch tests that feed four result action rows.";
const THIEF_ENCOUNTER_HELP = "Rogue Encounters are source Data TD2 records for lock, trap, search, and thief-skill scenes. Runtime can mutate trap/action state after play begins.";
const TIMED_ENCOUNTER_HELP = "Timed Encounters are source Data TD3 records that execute a macro/door when schedule, chance, item, quest, and location gates match.";

export function DomainTargetSwitcher({
  project,
  recordTypes,
  selectedRecordType,
  onSelectRecordType
}: {
  project: Project;
  recordTypes: RealmzTargetRecordKind[];
  selectedRecordType: RealmzTargetRecordKind;
  onSelectRecordType: (recordType: RealmzTargetRecordKind) => void;
}) {
  const options: Array<WorkbenchTabOption<RealmzTargetRecordKind>> = recordTypes.map((recordType) => {
    const help = targetRecordHelp(recordType);
    const label = targetRecordLabel(recordType);
    return {
      value: recordType,
      label: help ? (
        <TutorialTip title={label} body={help} side="right">
          <span>{label}</span>
        </TutorialTip>
      ) : label,
      meta: targetRecords(project, recordType).length.toLocaleString()
    };
  });
  return (
    <WorkbenchTabs
      ariaLabel="Writable Realmz record family"
      value={selectedRecordType}
      options={options}
      onChange={onSelectRecordType}
    />
  );
}

export function TargetRecordWorkbench({
  project,
  catalog,
  recordType,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onSelectEditor,
  onSelectRecordType,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordType: RealmzTargetRecordKind;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectRecordType?: (recordType: RealmzTargetRecordKind) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = useMemo(() => targetRecords(project, recordType), [project, recordType]);
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", recordType) ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedRecord(records, selectedId, 80), [records, selectedId]);
  const opcode = opcodeForTargetRecord(recordType);
  const nextId = useMemo(() => nextTargetRecordId(project, recordType), [project, recordType]);
  const recordHelp = targetRecordHelp(recordType);
  const encounterRecords = isEncounterRecordType(recordType);
  const [recordsCollapsedByType, setRecordsCollapsedByType] = useState<Record<string, boolean>>({});
  const recordsCollapsed = encounterRecords ? recordsCollapsedByType[recordType] ?? true : false;
  return (
    <article className="domain-target-workbench">
      <header>
        <div>
          {recordHelp ? (
            <TutorialTip title={`${targetRecordLabel(recordType)} Records`} body={recordHelp} side="right">
              <span>{targetRecordLabel(recordType)} Records</span>
            </TutorialTip>
          ) : (
            <span>{targetRecordLabel(recordType)} Records</span>
          )}
          <small>{records.length.toLocaleString()} editable Realmz fixed-record entr{records.length === 1 ? "y" : "ies"}</small>
        </div>
        <div className="domain-target-header-actions">
          {encounterRecords && (
            <button
              type="button"
              className="btn btn-secondary btn-xs domain-record-list-toggle"
              title={recordsCollapsed ? "Show encounter records list" : "Hide encounter records list"}
              aria-pressed={recordsCollapsed}
              onClick={() => setRecordsCollapsedByType((current) => ({ ...current, [recordType]: !(current[recordType] ?? true) }))}
            >
              {recordsCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
              {recordsCollapsed ? "Show Records" : "Hide Records"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${targetRecordLabel(recordType)}`, recordType, id: nextId });
              onSelectEntity(selectEntityFromId(targetEntityId(recordType, nextId)));
            }}
          >
            New {targetRecordLabel(recordType)} {nextId}
          </button>
        </div>
      </header>
      <div className={`domain-target-layout${encounterRecords ? " encounter-target-layout" : ""}${recordsCollapsed ? " domain-target-records-collapsed" : ""}`}>
        {!recordsCollapsed && (
          <ScrollArea className="domain-target-list" aria-label={`${targetRecordLabel(recordType)} records`}>
            {visibleRecords.map((record) => (
              <button
                key={`${recordType}:${record.id}`}
                type="button"
                className={record.id === selectedId ? "selected" : ""}
                onClick={() => onSelectEntity(selectEntityFromId(targetEntityId(recordType, record.id)))}
              >
                <strong>{targetRecordLabel(recordType)} {record.id}</strong>
                <small>{targetRecordSummary(project, recordType, record.id)}</small>
              </button>
            ))}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more {targetRecordLabel(recordType).toLowerCase()} record(s); use the focused editor or search to narrow.</p>
            )}
            {records.length === 0 && <p>No {targetRecordLabel(recordType).toLowerCase()} records yet.</p>}
          </ScrollArea>
        )}
        <div className="domain-target-editor">
          <TargetRecordEditor
            project={project}
            catalog={catalog}
            opcode={opcode}
            targetId={selectedId}
            recordType={recordType}
            presentation="workbench"
            desktopRuntime={previewContext.desktopRuntime}
            projectDir={previewContext.projectDir}
            workspaceDir={previewContext.workspaceDir}
            onSelectEntity={onSelectEntity}
            onSelectEditor={onSelectEditor}
            onSelectEncounterRecordType={onSelectRecordType}
            onApplyCommand={onApplyCommand}
          />
        </div>
      </div>
    </article>
  );
}

export function targetRecordTypesForEditor(tab: EditorTab, activeEditor: string): RealmzTargetRecordKind[] {
  if (tab === "text" && (activeEditor === "domain" || activeEditor === "messages")) return ["message"];
  if (tab === "combat" && activeEditor === "domain") return ["battle", "monster"];
  if (tab === "combat" && activeEditor === "battles") return ["battle"];
  if (tab === "combat" && activeEditor === "monsters") return ["monster"];
  if (tab === "encounters") return ["simpleEncounter", "complexEncounter", "thiefEncounter", "timedEncounter"];
  return [];
}

export function targetRecordTypeFromEditor(tab: EditorTab, activeEditor: string): RealmzTargetRecordKind | null {
  if (tab !== "encounters") return null;
  if (activeEditor === "simple") return "simpleEncounter";
  if (activeEditor === "complex") return "complexEncounter";
  if (activeEditor === "rogue") return "thiefEncounter";
  if (activeEditor === "timed") return "timedEncounter";
  return null;
}

function targetRecords(project: Project, recordType: RealmzTargetRecordKind): Array<{ id: number }> {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

function isEncounterRecordType(recordType: RealmzTargetRecordKind) {
  return recordType === "simpleEncounter" || recordType === "complexEncounter" || recordType === "thiefEncounter" || recordType === "timedEncounter";
}

function includeSelectedRecord<T extends { id: number }>(records: T[], selectedId: number, limit: number) {
  const visible = records.slice(0, limit);
  if (visible.some((record) => record.id === selectedId)) return visible;
  const selected = records.find((record) => record.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}

function targetIdFromSelection(entityId: string, recordType: RealmzTargetRecordKind) {
  const prefix = targetEntityPrefix(recordType);
  if (recordType === "timedEncounter") {
    const semanticMatch = entityId.match(/^time:(-?\d+)$/);
    if (semanticMatch) return Number(semanticMatch[1]);
  }
  if (recordType === "thiefEncounter") {
    const semanticMatch = entityId.match(/^thief:(-?\d+)$/);
    if (semanticMatch) return Number(semanticMatch[1]);
  }
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

export function selectedTargetRecordTypeFromEntity(entityId: string, recordTypes: RealmzTargetRecordKind[]) {
  return recordTypes.find((recordType) => targetIdFromSelection(entityId, recordType) !== null) ?? null;
}

function targetEntityId(recordType: RealmzTargetRecordKind, id: number) {
  return `${targetEntityPrefix(recordType)}${id}`;
}

function targetEntityPrefix(recordType: RealmzTargetRecordKind) {
  if (recordType === "simpleEncounter") return "encounter:simple:";
  if (recordType === "complexEncounter") return "encounter:complex:";
  if (recordType === "thiefEncounter") return "thief:";
  if (recordType === "timedEncounter") return "time:";
  if (recordType === "questLabel") return "quest:";
  return `${recordType}:`;
}

function opcodeForTargetRecord(recordType: RealmzTargetRecordKind) {
  if (recordType === "message") return 1;
  if (recordType === "battle") return 2;
  if (recordType === "monster") return 127;
  if (recordType === "treasure") return 10;
  if (recordType === "shop") return 6;
  if (recordType === "simpleEncounter") return 4;
  if (recordType === "complexEncounter") return 5;
  if (recordType === "thiefEncounter") return 5;
  if (recordType === "timedEncounter") return 54;
  return 47;
}

function targetRecordLabel(recordType: RealmzTargetRecordKind) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "Message",
    battle: "Battle",
    monster: "Monster",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
    thiefEncounter: "Rogue Encounter",
    timedEncounter: "Time Encounter",
    questLabel: "Quest Label"
  };
  return labels[recordType];
}

function targetRecordHelp(recordType: RealmzTargetRecordKind) {
  if (recordType === "simpleEncounter") return SIMPLE_ENCOUNTER_HELP;
  if (recordType === "complexEncounter") return COMPLEX_ENCOUNTER_HELP;
  if (recordType === "thiefEncounter") return THIEF_ENCOUNTER_HELP;
  if (recordType === "timedEncounter") return TIMED_ENCOUNTER_HELP;
  return null;
}

function nextTargetRecordId(project: Project, recordType: RealmzTargetRecordKind) {
  const used = new Set(targetRecords(project, recordType).map((record) => record.id));
  const firstId = isEncounterRecordType(recordType) ? 0 : 1;
  for (let id = firstId; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + firstId;
}

function targetRecordSummary(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  if (recordType === "message") return (project.messages ?? []).find((record) => record.id === id)?.text.slice(0, 80) || "empty message";
  if (recordType === "battle") {
    const record = (project.battles ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.grid.filter(Boolean).length} monster slot(s), messages ${record.messageBefore}/${record.messageAfter}` : "missing battle";
  }
  if (recordType === "monster") {
    const record = (project.monsters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.displayName || `Monster ${id}`}, HD ${record.hitDice}, icon ${record.iconId}` : "missing monster";
  }
  if (recordType === "treasure") {
    const record = (project.treasures ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold, ${record.exp} exp` : "missing treasure";
  }
  if (recordType === "shop") {
    const record = (project.shops ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation` : "missing shop";
  }
  if (recordType === "simpleEncounter") {
    const record = (project.simpleEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing simple encounter";
  }
  if (recordType === "complexEncounter") {
    const record = (project.complexEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing complex encounter";
  }
  if (recordType === "thiefEncounter") {
    const record = (project.thiefEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.typeFlags.filter(Boolean).length} enabled action(s), trap ${record.lowDamage}-${record.highDamage}, spell ${record.spell}` : "missing rogue encounter";
  }
  if (recordType === "timedEncounter") {
    const record = (project.timedEncounters ?? []).find((candidate) => candidate.id === id);
    if (!record) return "missing time encounter";
    const location =
      record.locationKind === "land" ? "land" :
      record.locationKind === "dungeon" ? "dungeon" :
      "anywhere";
    return `day ${record.day}, every ${record.increment}, ${record.percent}% chance, ${location}`;
  }
  return "metadata";
}

export function readStoredOverviewTargetRecordType(tab: EditorTab) {
  try {
    const value = window.localStorage.getItem(`domain.${tab}.targetRecordType`) as RealmzTargetRecordKind | null;
    return value;
  } catch {
    return null;
  }
}

export function writeStoredOverviewTargetRecordType(tab: EditorTab, recordType: RealmzTargetRecordKind) {
  try {
    window.localStorage.setItem(`domain.${tab}.targetRecordType`, recordType);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}
