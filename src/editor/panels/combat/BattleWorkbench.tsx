import { type ReactNode, useMemo, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "../scripts/scriptActionCatalog";
import type { BattleRecord, LibraryCatalog, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import {
  BattleMacroReferenceField,
  BattleRecordReferenceField,
  BattleStringReferenceField
} from "./BattleReferenceFields";
import { MONSTER_SET_OPTIONS } from "./combatLookups";
import { FieldLabel, NumberField } from "./CombatFields";

export type BattleBoardRenderProps = {
  battle: BattleRecord;
  monsterSetPreview: MonsterSetId;
  onMonsterSetPreviewChange: (value: MonsterSetId) => void;
  onUpdateGrid: (grid: number[]) => void;
};

export function BattleWorkbench({
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onApplyCommand,
  renderBoard
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  renderBoard: (props: BattleBoardRenderProps) => ReactNode;
}) {
  const battles = useMemo(() => [...(project.battles ?? [])].sort((a, b) => a.id - b.id), [project.battles]);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "battle:");
  const selectedId = selectedFromEntity ?? battles[0]?.id ?? 0;
  const selected = battles.find((battle) => battle.id === selectedId) ?? battles[0] ?? null;
  const nextBattleId = nextAvailableId(battles);
  const selectBattle = (id: number) => onSelectEntity(selectEntityFromId(`battle:${id}`));
  const createBattle = () => {
    onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: nextBattleId });
    selectBattle(nextBattleId);
  };
  const update = (id: number, changes: BattleRecordChanges) =>
    onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle", id, changes });

  return (
    <div className="combat-record-layout battle-layout">
      {selected ? (
        <BattleEditor
          project={project}
          catalog={catalog}
          battle={selected}
          battles={battles}
          onUpdate={(changes) => update(selected.id, changes)}
          onSelectBattle={selectBattle}
          nextBattleId={nextBattleId}
          onNew={createBattle}
          onDuplicate={() => {
            const id = nextBattleId;
            update(id, {
              grid: [...selected.grid],
              dist: selected.dist,
              messageBefore: selected.messageBefore,
              messageAfter: selected.messageAfter,
              battleMacro: selected.battleMacro
            });
            selectBattle(id);
          }}
          onClear={() => update(selected.id, { grid: new Array(169).fill(0), dist: 0, messageBefore: 0, messageAfter: 0, battleMacro: 0 })}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
          renderBoard={renderBoard}
        />
      ) : (
        <article className="combat-editor battle-editor empty">
          <h2>No battle records</h2>
          <button type="button" className="btn btn-primary btn-sm battle-empty-action" onClick={createBattle}>New Battle {nextBattleId}</button>
          <p>Create a battle record to begin placing monsters.</p>
        </article>
      )}
    </div>
  );
}

export function BattleScenarioMonsterSetField({ value, onCommit, compact = false }: { value: MonsterSetId; onCommit: (value: MonsterSetId) => void; compact?: boolean }) {
  return (
    <div className={`combat-field battle-scenario-monster-set${compact ? " compact" : ""}`}>
      <FieldLabel label="Monster Set" help="Chooses which scenario monster table the Battles tool uses for placement and validation. It applies across the Battles tab; Data BD stores monster IDs only, so this does not write a value into the selected battle record." />
      <select value={String(value)} onChange={(event) => onCommit(Number(event.currentTarget.value) as MonsterSetId)} aria-label="Scenario monster set">
        {MONSTER_SET_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label} ({option.file})</option>
        ))}
      </select>
    </div>
  );
}

type BattleRecordChanges = Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">>;

function BattleEditor({
  project,
  catalog,
  battle,
  battles,
  onUpdate,
  onSelectBattle,
  nextBattleId,
  onNew,
  onDuplicate,
  onClear,
  onSelectEntity,
  onApplyCommand,
  renderBoard
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  battle: BattleRecord;
  battles: BattleRecord[];
  onUpdate: (changes: BattleRecordChanges) => void;
  onSelectBattle: (id: number) => void;
  nextBattleId: number;
  onNew: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  renderBoard: (props: BattleBoardRenderProps) => ReactNode;
}) {
  const [scenarioMonsterSet, setScenarioMonsterSet] = useState<MonsterSetId>(0);
  return (
    <article className="combat-editor battle-editor">
      <header className="combat-editor-header">
        <div className="combat-editor-title">
          <BattleRecordReferenceField
            value={battle.id}
            battles={battles}
            help="Use the arrows to page through existing Data BD battle records, or type an existing battle number."
            onChange={onSelectBattle}
          />
        </div>
        <div className="battle-header-fields">
          <BattleDistanceField value={battle.dist} onCommit={(dist) => onUpdate({ dist })} />
          <BattleStringReferenceField
            project={project}
            label="Before String"
            value={battle.messageBefore}
            help="Data BD before-string ID. Realmz displays this Data SD2 string before combat starts when the value is nonzero."
            onCommit={(messageBefore) => onUpdate({ messageBefore })}
            onSelectEntity={onSelectEntity}
            onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create before battle string", recordType: "message", id })}
            onUpdateString={(id, text) => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update before battle string ${id}`, id, changes: { text } })}
          />
          <BattleStringReferenceField
            project={project}
            label="After String"
            value={battle.messageAfter}
            help="Data BD after-string ID. Realmz copies this Data SD2 string for post-battle display when the value is nonzero."
            onCommit={(messageAfter) => onUpdate({ messageAfter })}
            onSelectEntity={onSelectEntity}
            onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create after battle string", recordType: "message", id })}
            onUpdateString={(id, text) => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update after battle string ${id}`, id, changes: { text } })}
          />
          <BattleMacroReferenceField
            project={project}
            value={battle.battleMacro}
            onCommit={(battleMacro) => onUpdate({ battleMacro })}
            onSelectEntity={onSelectEntity}
            previewContent={(
              <BattleActionFlowContent
                project={project}
                catalog={catalog}
                actionId={Math.abs(battle.battleMacro)}
                onSelectEntity={onSelectEntity}
              />
            )}
          />
        </div>
        <div className="battle-header-actions">
          <span>
            <TutorialTip title="Record Tools" body="Create, duplicate, or clear the current Data BD battle record." side="right">
              <span>RECORD TOOLS</span>
            </TutorialTip>
          </span>
          <div className="combat-editor-actions">
            <button type="button" className="btn btn-primary btn-xs" onClick={onNew}>New Battle {nextBattleId}</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>Duplicate</button>
            <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>Clear Battle</button>
          </div>
        </div>
      </header>
      {renderBoard({
        battle,
        monsterSetPreview: scenarioMonsterSet,
        onMonsterSetPreviewChange: setScenarioMonsterSet,
        onUpdateGrid: (grid) => onUpdate({ grid })
      })}
    </article>
  );
}

function BattleDistanceField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const outOfRange = value < 0 || value > 30;
  return (
    <div className="combat-distance-field">
      <NumberField
        label="Distance"
        value={value}
        help="Set 1-30 to let Realmz spawn monsters farther from the party in a random direction. Zero means no randomized distance spread."
        onCommit={onCommit}
      />
      {outOfRange ? (
        <small className="combat-field-warning">Current value {value} is outside the usual 0-30 range. Providence preserves it until you edit this field.</small>
      ) : null}
    </div>
  );
}

function BattleActionFlowContent({
  project,
  catalog,
  actionId,
  onSelectEntity
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  actionId: number;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const trigger = (project.triggers ?? []).find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === actionId) ?? null;
  const actions = trigger?.actions.filter((action) => action.rawCode !== 0).sort((left, right) => left.slot - right.slot) ?? [];
  return (
    <div className="combat-flow-disclosure battle-reference-flow-preview">
      {actions.length === 0 && <p>No action steps.</p>}
      {actions.map((action) => {
        const definition = scriptActionDefinitionFor(action.rawCode);
        const routes = scriptStepFlowRoutes(project, catalog, { rawCode: action.rawCode, id: action.id });
        const route = routes[0] ?? null;
        const summary = route?.target ? `${route.label}: ${route.target.label}` : route?.detail || scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id });
        return (
          <div key={`${action.slot}-${action.rawCode}-${action.id}`} className="combat-flow-step">
            <span>{action.slot + 1}</span>
            <p>
              <b>{definition.shortLabel}</b>
              <small>{summary}</small>
            </p>
            {route?.target && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityForCombatFlowTarget(route.target!))}>
                Open
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function selectEntityForCombatFlowTarget(target: { targetKind: string; value: number }): SelectedEntity {
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

function idFromEntity(entityId: string, prefix: string) {
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

function nextAvailableId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size;
}
