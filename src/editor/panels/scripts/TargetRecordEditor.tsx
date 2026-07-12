import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { useIconPreviewUrl } from "../../previewUrls";
import { ACTION_OPTIONS, actionOptionFor } from "../../realmzActions";
import { realmzScriptStepDescriptorFor } from "../../realmzScriptDescriptors";
import type { ScriptDiagnostic } from "../../scriptValidation";
import type { EncounterActionRow, LibraryCatalog, Project, ProjectCommand, RealmzTargetRecordKind, SelectedEntity } from "../../types";
import { CollapsibleSection, EmptyState } from "../../ui";
import { selectEntityFromId } from "../../utils";
import { validateRealmzTargetRecord } from "../../targetValidation";
import {
  ITEM_REFERENCE_CATEGORIES,
  filterItemReferenceOptionsByCategory,
  itemCategoryBadge,
  itemOptionDisplayName,
  itemReferenceDetail,
  itemReferenceOptions,
  type ItemReferenceCategory,
  type ItemReferenceOption
} from "../../itemReferences";
import { monsterReferenceDetail, monsterReferenceOptions } from "../../monsterReferences";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../../rulesCatalog";
import {
  buildEncounterDecisionSources,
  resultStatusCounts,
  shortSnippet,
  type EncounterDecisionSource
} from "./encounterFlow";
import { EncounterShell } from "./EncounterShell";
import { ItemIdField } from "./ItemIdField";
import { encounterEntityId } from "./EncounterRecordPicker";
import { NumberField } from "./NumberField";
import { ReferenceIdField } from "./ReferenceIdField";
import {
  ROGUE_DISARM_TRAP_SPELL_PATH,
  ROGUE_OPEN_LOCK_SPELL_PATH,
  ThiefEncounterShell,
  rogueSpellPathSummary
} from "./ThiefEncounterShell";
import { TimedEncounterShell, timedEncounterEligibilitySummary } from "./TimedEncounterShell";
import { ScriptDiagnostics } from "./ScriptDiagnostics";
import { updateArraySlot } from "./arraySlots";

const MONSTER_TRAIT_LABELS = [
  "Magic Using",
  "Undead",
  "Demonic/Devil",
  "Reptilian",
  "Very Evil",
  "Intelligent",
  "Giant Size",
  "Non-Humanoid"
];

const MONSTER_MONEY_LABELS = ["Gold", "Gems", "Jewelry"];
const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;
const SIMPLE_ENCOUNTER_SOURCE_HELP =
  "Simple Encounters are Data ED source records. The prompt points to a String, the four option labels live inside this record, and each option result jumps to one of four script columns.";
const COMPLEX_ENCOUNTER_SOURCE_HELP =
  "Complex Encounters are Data ED2 source records. Player choices, typed replies, magic responses, item responses, and Rogue Encounters all reduce to result numbers that run one of four script columns.";
const ROGUE_ENCOUNTER_SOURCE_HELP =
  "Rogue Encounters are Data TD2 source records for locks, traps, search, and thief-skill actions. Runtime can mark traps detected, disabled, or sprung without changing this source record.";
const TIMED_ENCOUNTER_SOURCE_HELP =
  "Time Encounters are Data TD3 source records. Realmz checks schedule, chance, location, item, and quest gates, then runs the Extra Action Point target when everything matches.";

export function TargetRecordEditor({
  project,
  catalog,
  opcode,
  targetId,
  recordType,
  presentation = "context",
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onSelectEncounterRecordType,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  opcode: number;
  targetId: number;
  recordType?: RealmzTargetRecordKind;
  presentation?: "context" | "workbench" | "inline";
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectEncounterRecordType?: (recordType: RealmzTargetRecordKind) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const descriptor = realmzScriptStepDescriptorFor(opcode);
  const targetType = recordType ?? descriptor.targetType;
  if (!targetType || !Number.isInteger(targetId) || targetId < 0) {
    if (descriptor.edcdShape) {
      return (
        <EmptyState
          compact
          title="Target is stored in Settings"
          body="This action keeps its string, battle, shop, item, or branch fields in the Settings section."
        />
      );
    }
    return <EmptyState compact title="No editable target" body="Choose an action with a target to edit string, battle, treasure, shop, or encounter details here." />;
  }
  if (targetId === 0 && !targetRecordExists(project, targetType, targetId)) {
    return <EmptyState compact title="No target selected" body="Choose an existing target or create a new one from the picker." />;
  }
  const targetIssues = validateRealmzTargetRecord(project, targetType, targetId, catalog);
  const targetChrome = presentation === "inline" ? "embedded" : "full";
  if (presentation === "workbench" && targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Simple Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            catalog={catalog}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            workspaceDir={workspaceDir}
            recordKind="simple"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            actions={record.actions}
            onSelectEntity={onSelectEntity}
            onSelectEditor={onSelectEditor}
            onSelectEncounterRecordType={onSelectEncounterRecordType}
            onApplyCommand={onApplyCommand}
            targetExists={(recordType, id) => targetRecordExists(project, recordType, id)}
            renderRecordPreview={(targetType, id) => encounterResultRecordPreview(project, catalog, targetType, id)}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            catalog={catalog}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            workspaceDir={workspaceDir}
            recordKind="complex"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            actionResult={record.actionResult}
            wordResult={record.wordResult}
            groups={record.groups}
            spellIds={record.spellIds}
            spellResults={record.spellResults}
            itemIds={record.itemIds}
            itemResults={record.itemResults}
            choiceResults={record.choiceResults}
            wordResults={record.wordResults}
            thief={record.thief}
            thiefSuccess={record.thiefSuccess}
            actions={record.actions}
            onSelectEntity={onSelectEntity}
            onSelectEditor={onSelectEditor}
            onSelectEncounterRecordType={onSelectEncounterRecordType}
            onApplyCommand={onApplyCommand}
            targetExists={(recordType, id) => targetRecordExists(project, recordType, id)}
            renderRecordPreview={(targetType, id) => encounterResultRecordPreview(project, catalog, targetType, id)}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Rogue Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: targetId })}
      >
        {record && (
          <ThiefEncounterShell
            project={project}
            catalog={catalog}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
            id={targetId}
            record={record}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Time Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create timed encounter", recordType: "timedEncounter", id: targetId })}
      >
        {record && <TimedEncounterShell project={project} catalog={catalog} id={targetId} record={record} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`String ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create string", recordType: "message", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear string", recordType: "message", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Text</span>
            <textarea
              key={`message:${targetId}`}
              defaultValue={record.text}
              maxLength={255}
              onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update string", id: targetId, changes: { text: event.currentTarget.value } })}
            />
            <small>{record.text.length}/255 bytes before Classic encoding</small>
          </label>
        )}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="battle" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Monster ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="monster" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Treasure ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="treasure" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Shop ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="shop" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear battle", recordType: "battle", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Distance" value={record.dist} onCommit={(dist) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle distance", id: targetId, changes: { dist } })} />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Before String"
              emptyLabel="No before string"
              opcode={1}
              value={record.messageBefore}
              createRecordType="message"
              onCommit={(messageBefore) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle string", id: targetId, changes: { messageBefore } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle string", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="After String"
              emptyLabel="No after string"
              opcode={1}
              value={record.messageAfter}
              createRecordType="message"
              onCommit={(messageAfter) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle string", id: targetId, changes: { messageAfter } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle string", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Battle Action"
              emptyLabel="No battle action"
              opcode={39}
              value={record.battleMacro}
              onCommit={(battleMacro) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle action", id: targetId, changes: { battleMacro } })}
            />
            <BattleGridEditor
              project={project}
              catalog={catalog}
              grid={record.grid}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle grid", id: targetId, changes: { grid: updateArraySlot(record.grid, index, value, 13 * 13) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    const update = (changes: Partial<NonNullable<Project["monsters"]>[number]>) => onApplyCommand?.({ kind: "updateMonsterRecord", label: "Update monster", id: targetId, changes });
    return (
      <InlineTargetShell
        title={`Monster ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear monster", recordType: "monster", id: targetId })}
      >
        {record && (
          <div className="monster-editor-shell">
            <section className="monster-editor-section">
              <header>
                <strong>Identity</strong>
                <small>Name, bestiary visibility, icon, and defeat action.</small>
              </header>
              <div className="monster-editor-grid">
                <label className="script-target-wide-field monster-name-field">
                  <span>Monster Name</span>
                  <input
                    defaultValue={record.displayName}
                    maxLength={40}
                    onBlur={(event) => update({ displayName: event.currentTarget.value })}
                  />
                  <small>{record.displayName.length}/40 characters</small>
                </label>
                <NumberField label="Monster Name ID" value={record.nameId} onCommit={(nameId) => update({ nameId })} compact />
                <NumberField label="Icon" value={record.iconId} onCommit={(iconId) => update({ iconId })} compact />
                <label className="script-target-checkbox">
                  <span>Hide From Bestiary</span>
                  <input type="checkbox" checked={record.notOnMenu} onChange={(event) => update({ notOnMenu: event.currentTarget.checked })} />
                </label>
                <ReferenceIdField
                  project={project}
                  catalog={catalog}
                  label="Defeat Action"
                  emptyLabel="No defeat action"
                  opcode={39}
                  value={record.deathMacro}
                  onCommit={(deathMacro) => update({ deathMacro })}
                />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Combat Stats</strong>
                <small>Divinity's stamina level, movement, armor, resistance, and victory reward fields.</small>
              </header>
              <div className="monster-editor-grid">
                <NumberField label="Stamina Level" value={record.hitDice} onCommit={(hitDice) => update({ hitDice })} compact />
                <NumberField label="Bonus Stamina" value={record.staminaBonus} onCommit={(staminaBonus) => update({ staminaBonus })} compact />
                <NumberField label="Agility" value={record.agility} onCommit={(agility) => update({ agility })} compact />
                <NumberField label="Move Max" value={record.movementMax} onCommit={(movementMax) => update({ movementMax })} compact />
                <NumberField label="Armor Rating" value={record.armor} onCommit={(armor) => update({ armor })} compact />
                <NumberField label="Magic Resist %" value={record.magicResistance} onCommit={(magicResistance) => update({ magicResistance })} compact />
                <NumberField label="Magic + Req To Hit" value={record.magicToHit} onCommit={(magicToHit) => update({ magicToHit })} compact />
                <NumberField label="Extra Victory Points" value={record.exp} onCommit={(exp) => update({ exp })} compact />
                <NumberField label="Spell Points" value={record.spellPoints} onCommit={(spellPoints) => update({ spellPoints })} compact />
                <NumberField label="Max Spell Points" value={record.maxSpellPoints} onCommit={(maxSpellPoints) => update({ maxSpellPoints })} compact />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Battle Behavior</strong>
                <small>Team side, size, attacks, spellcasting, missile use, and retreat logic.</small>
              </header>
              <div className="monster-editor-grid">
                <NumberField label="Traitor / Side" value={record.traitor} onCommit={(traitor) => update({ traitor })} compact />
                <NumberField label="Size" value={record.size} onCommit={(size) => update({ size })} compact />
                <RequiredWeaponField project={project} catalog={catalog} value={record.distance} onCommit={(distance) => update({ distance })} compact />
                <NumberField label="No. Of Attacks" value={record.attackCount} onCommit={(attackCount) => update({ attackCount })} compact />
                <NumberField label="Magical Attacks" value={record.magicAttackCount} onCommit={(magicAttackCount) => update({ magicAttackCount })} compact />
                <NumberField label="Damage Plus" value={record.damageBonus} onCommit={(damageBonus) => update({ damageBonus })} compact />
                <NumberField label="Cast Spell %" value={record.castPercent} onCommit={(castPercent) => update({ castPercent })} compact />
                <NumberField label="Run Away %" value={record.runPercent} onCommit={(runPercent) => update({ runPercent })} compact />
                <NumberField label="Surrender %" value={record.surrenderPercent} onCommit={(surrenderPercent) => update({ surrenderPercent })} compact />
                <NumberField label="Use Missile %" value={record.missilePercent} onCommit={(missilePercent) => update({ missilePercent })} compact />
                <NumberField label="Summon Eligible" value={record.canSummon} onCommit={(canSummon) => update({ canSummon })} compact />
                <ItemIdField project={project} catalog={catalog} label="Weapon Used" value={record.weapon} onCommit={(weapon) => update({ weapon })} compact />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Physical Traits</strong>
                <small>Used by race/caste bonuses, turning, targeting, and special attack logic.</small>
              </header>
              <div className="monster-trait-grid">
                {MONSTER_TRAIT_LABELS.map((label, slot) => (
                  <label key={label} className="script-target-checkbox">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(record.typeFlags?.[slot])}
                      onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], slot, event.currentTarget.checked ? 1 : 0, 8) })}
                    />
                  </label>
                ))}
              </div>
            </section>

            <CollapsibleSection title="Attack Rows" eyebrow="combat" count="5 rows" density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-attack-grid">
                {Array.from({ length: 5 }, (_, row) => {
                  const values = record.attacks?.[row] ?? [0, 0, 0, 0];
                  return (
                    <div key={row} className="encounter-action-row monster-attack-row">
                      <strong>Attack {row + 1}</strong>
                      {["Damage Low", "Damage High", "Form", "Special"].map((label, slot) => (
                        <NumberField
                          key={label}
                          label={label}
                          value={values[slot] ?? 0}
                          onCommit={(value) => {
                            const attacks = [...(record.attacks ?? [])];
                            while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                            attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                            update({ attacks });
                          }}
                          compact
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Spells" eyebrow="10 slots" count={`${record.spells.filter(Boolean).length} filled`} density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-compact-field-grid">
                {Array.from({ length: 10 }, (_, slot) => (
                  <NumberField
                    key={slot}
                    label={`Spell ${slot + 1}`}
                    value={record.spells[slot] ?? 0}
                    onCommit={(value) => update({ spells: updateArraySlot(record.spells ?? [], slot, value, 10) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Items And Treasure" eyebrow="loot" count={`${record.items.filter(Boolean).length} item(s)`} density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-editor-grid">
                {MONSTER_MONEY_LABELS.map((label, slot) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={record.money[slot] ?? 0}
                    onCommit={(value) => update({ money: updateArraySlot(record.money ?? [], slot, value, 3) })}
                    compact
                  />
                ))}
              </div>
              <div className="monster-item-grid">
                {Array.from({ length: 6 }, (_, slot) => (
                  <ItemIdField
                    key={slot}
                    project={project}
                    catalog={catalog}
                    label={`Item ${slot + 1}`}
                    value={record.items[slot] ?? 0}
                    onCommit={(value) => update({ items: updateArraySlot(record.items ?? [], slot, value, 6) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Saves And Immunities" eyebrow="spells" count="6 classes" density="compact" className="monster-editor-wide-section">
              <div className="monster-save-grid">
                {Array.from({ length: 6 }, (_, slot) => {
                  const label = RESISTANCE_TYPES[slot] ?? `Class ${slot}`;
                  return (
                    <div key={label} className="monster-save-row">
                      <NumberField
                        label={`${label} DRVs`}
                        value={record.saves[slot] ?? 0}
                        onCommit={(value) => update({ saves: updateArraySlot(record.saves ?? [], slot, value, 6) })}
                        compact
                      />
                      <label className="script-target-checkbox">
                        <span>Immune</span>
                        <input
                          type="checkbox"
                          checked={Boolean(record.spellImmunities?.[slot])}
                          onChange={(event) => update({ spellImmunities: updateArraySlot(record.spellImmunities ?? [], slot, event.currentTarget.checked ? 1 : 0, 6) })}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Conditions" eyebrow="40 fields" count={`${record.conditions.filter(Boolean).length} set`} density="compact" className="monster-editor-wide-section">
              <div className="monster-condition-grid">
                {CONDITION_LABELS.map((label, slot) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={record.conditions[slot] ?? 0}
                    onCommit={(value) => update({ conditions: updateArraySlot(record.conditions ?? [], slot, value, 40) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Advanced Combat Defaults" eyebrow="runtime fields" count="template" density="compact" className="monster-editor-wide-section">
              <div className="monster-editor-grid">
                <NumberField label="Template Stamina" value={record.stamina} onCommit={(stamina) => update({ stamina })} compact />
                <NumberField label="Template Max Stamina" value={record.staminaMax} onCommit={(staminaMax) => update({ staminaMax })} compact />
                <NumberField label="Target" value={record.target} onCommit={(target) => update({ target })} compact />
                <NumberField label="Guarding" value={record.guarding} onCommit={(guarding) => update({ guarding })} compact />
                <NumberField label="Been Attacked" value={record.beenAttacked} onCommit={(beenAttacked) => update({ beenAttacked })} compact />
                <NumberField label="Movement" value={record.movement} onCommit={(movement) => update({ movement })} compact />
                <NumberField label="Left / Right" value={record.lr} onCommit={(lr) => update({ lr })} compact />
                <NumberField label="Up / Down" value={record.up} onCommit={(up) => update({ up })} compact />
                <NumberField label="Attack Number" value={record.attackNum} onCommit={(attackNum) => update({ attackNum })} compact />
                <NumberField label="Bonus Attack" value={record.bonusAttack} onCommit={(bonusAttack) => update({ bonusAttack })} compact />
              </div>
            </CollapsibleSection>
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Treasure ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear treasure", recordType: "treasure", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <TreasureRewardField label="Victory Points" value={record.exp} onCommit={(exp) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure victory points", id: targetId, changes: { exp } })} />
            <TreasureRewardField label="Gold" value={record.gold} onCommit={(gold) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gold", id: targetId, changes: { gold } })} />
            <TreasureRewardField label="Gems" value={record.gems} onCommit={(gems) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gems", id: targetId, changes: { gems } })} />
            <TreasureRewardField label="Jewelry" value={record.jewelry} onCommit={(jewelry) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure jewelry", id: targetId, changes: { jewelry } })} />
            <TreasureCatalogAdder
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              onAddItem={(itemId) => {
                const slot = firstOpenTreasureSlot(record.itemIds);
                if (slot >= 0) onApplyCommand?.({ kind: "updateTreasureRecord", label: "Add treasure item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, slot, itemId, 20) } });
              }}
            />
            <TreasureItemGrid
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 20) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Shop ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear shop", recordType: "shop", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Inflation" value={record.inflation} onCommit={(inflation) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop inflation", id: targetId, changes: { inflation } })} />
            <div className="script-shop-source-note">
              <strong>Scenario shop stock</strong>
              <span>These values define what Realmz copies into a new game. Parties already inside a saved game keep their current shop inventory.</span>
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => onApplyCommand?.({
                  kind: "updateShopRecord",
                  label: "Clear shop stock",
                  id: targetId,
                  changes: { itemIds: new Array(1000).fill(0), quantities: new Array(1000).fill(0) }
                })}
              >
                Clear Shop Stock
              </button>
            </div>
            <ShopStockEditor
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              quantities={record.quantities}
              desktopRuntime={desktopRuntime}
              projectDir={projectDir}
              workspaceDir={workspaceDir}
              onCommitItem={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 1000) } })}
              onCommitQuantity={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop quantity", id: targetId, changes: { quantities: updateArraySlot(record.quantities, index, value, 1000) } })}
              onReplaceStock={(itemIds, quantities) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop stock", id: targetId, changes: { itemIds, quantities } })}
              onClearSlot={(index) => onApplyCommand?.({
                kind: "updateShopRecord",
                label: "Clear shop stock slot",
                id: targetId,
                changes: {
                  itemIds: updateArraySlot(record.itemIds, index, 0, 1000),
                  quantities: updateArraySlot(record.quantities, index, 0, 1000)
                }
              })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Simple Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={SIMPLE_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="simpleEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={COMPLEX_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="complexEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Time Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={TIMED_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create time encounter", recordType: "timedEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="timedEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Rogue Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={ROGUE_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="thiefEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "questLabel") {
    const record = project.questLabels?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Quest ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: targetId, label: `Quest ${targetId}` } })}
        onClear={() => onApplyCommand?.({ kind: "deleteQuestLabel", label: "Clear quest label", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Label</span>
            <input defaultValue={record.label} onBlur={(event) => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest label", quest: { ...record, label: event.currentTarget.value } })} />
          </label>
        )}
      </InlineTargetShell>
    );
  }
  return null;
}

function InlineTargetShell({
  title,
  exists,
  onCreate,
  onClear,
  issues,
  help,
  chrome = "full",
  children
}: {
  title: string;
  exists: boolean;
  onCreate: () => void;
  onClear?: () => void;
  issues?: ScriptDiagnostic[];
  help?: string;
  chrome?: "full" | "embedded";
  children: ReactNode;
}) {
  if (chrome === "embedded") {
    return (
      <div className="script-inline-target-editor embedded">
        {exists && issues && issues.length > 0 && <ScriptDiagnostics issues={issues} />}
        {exists ? children : (
          <div className="inline-message-target-missing">
            <small>This step points at {title}, but that target does not exist yet.</small>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>Create {title}</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="script-inline-target-editor">
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="below">
            <strong>{title}</strong>
          </TutorialTip>
        ) : (
          <strong>{title}</strong>
        )}
        <div className="script-inline-target-actions">
          {!exists && <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>Create {title}</button>}
          {exists && onClear && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              title="Replace this fixed Realmz record with an empty reusable default record."
              onClick={onClear}
            >
              Clear to Defaults
            </button>
          )}
        </div>
      </header>
      {exists && issues && issues.length > 0 && <ScriptDiagnostics issues={issues} />}
      {exists ? children : <small>This slot points at a target that does not exist yet.</small>}
    </div>
  );
}

function TargetSummaryCard({
  project,
  catalog,
  recordType,
  id,
  record,
  onSelectEntity
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordType: "battle" | "monster" | "treasure" | "shop";
  id: number;
  record:
    | Project["battles"][number]
    | Project["monsters"][number]
    | Project["treasures"][number]
    | Project["shops"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const entityId = `${recordType}:${id}`;
  const editorLabel = recordType === "battle" || recordType === "monster" ? "Combat" : "Economy";
  const open = onSelectEntity ? () => onSelectEntity(selectEntityFromId(entityId)) : undefined;
  if (recordType === "battle") {
    const battle = record as Project["battles"][number];
    const monsterSlots = battle.grid.filter(Boolean).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Battle ${id}`} subtitle={`${monsterSlots} placed monster slot${monsterSlots === 1 ? "" : "s"}`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>Distance {battle.dist}</span>
          <span>{battle.messageBefore > 0 ? `Before string ${battle.messageBefore}` : "No before string"}</span>
          <span>{battle.messageAfter > 0 ? `After string ${battle.messageAfter}` : "No after string"}</span>
          <span>{battle.battleMacro > 0 ? `Battle action ${battle.battleMacro}` : "No battle action"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "monster") {
    const monster = record as Project["monsters"][number];
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Monster ${id}`} subtitle={monster.displayName || `Monster name ${monster.nameId}`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>Icon {monster.iconId}</span>
          <span>Stamina level {monster.hitDice}</span>
          <span>Armor {monster.armor}</span>
          <span>{monster.deathMacro > 0 ? `Defeat action ${monster.deathMacro}` : "No defeat action"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "treasure") {
    const treasure = record as Project["treasures"][number];
    const itemCount = treasure.itemIds.filter(Boolean).length;
    const firstItem = treasure.itemIds.find(Boolean);
    const firstItemLabel = firstItem ? itemReferenceDetail(project, firstItem, catalog) : "";
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Treasure ${id}`} subtitle={`${itemCount} item slot${itemCount === 1 ? "" : "s"}, ${treasure.gold} gold`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>{treasure.exp} victory points</span>
          <span>{treasure.gems} gems</span>
          <span>{treasure.jewelry} jewelry</span>
          <span>{firstItemLabel || "No item preview"}</span>
        </div>
      </div>
    );
  }
  const shop = record as Project["shops"][number];
  const stockCount = shop.itemIds.filter((itemId, index) => itemId > 0 && (shop.quantities[index] ?? 0) > 0).length;
  const firstStockIndex = shop.itemIds.findIndex((itemId, index) => itemId > 0 && (shop.quantities[index] ?? 0) > 0);
  const firstStockId = firstStockIndex >= 0 ? shop.itemIds[firstStockIndex] : 0;
  const firstStockLabel = firstStockId ? itemReferenceDetail(project, firstStockId, catalog) : "";
  return (
    <div className="encounter-target-card">
      <EncounterTargetCardHeader title={`Shop ${id}`} subtitle={`${stockCount} stocked slot${stockCount === 1 ? "" : "s"}, ${shop.inflation}% inflation`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
      <div className="encounter-target-facts">
        <span>{firstStockLabel || "No stock preview"}</span>
        <span>{firstStockIndex >= 0 ? `${shop.quantities[firstStockIndex] ?? 0} in first stocked slot` : "Empty stock"}</span>
      </div>
    </div>
  );
}

function EncounterTargetCard({
  project,
  recordType,
  id,
  record,
  onSelectEntity
}: {
  project: Project;
  recordType: "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter";
  id: number;
  record:
    | Project["simpleEncounters"][number]
    | Project["complexEncounters"][number]
    | Project["thiefEncounters"][number]
    | Project["timedEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const entityId = encounterEntityId(recordType, id);
  const open = onSelectEntity ? () => onSelectEntity({ type: "encounter", id: entityId }) : undefined;
  if (recordType === "simpleEncounter") {
    const simple = record as Project["simpleEncounters"][number];
    const sources = buildEncounterDecisionSources({
      recordKind: "simple",
      texts: simple.texts,
      actionResult: 0,
      wordResult: 0,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: simple.choiceResults,
      actions: simple.actions,
      thief: false,
      rogueId: 0
    });
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Simple Encounter ${id}`} subtitle={messageSnippet(project, simple.prompt) || "No prompt string"} onOpen={open} />
        <EncounterTargetStatus actions={simple.actions} sources={sources} />
      </div>
    );
  }
  if (recordType === "complexEncounter") {
    const complex = record as Project["complexEncounters"][number];
    const rogueRecord = project.thiefEncounters?.find((candidate) => candidate.id === complex.thiefSuccess);
    const sources = buildEncounterDecisionSources({
      recordKind: "complex",
      texts: complex.texts,
      actionResult: complex.actionResult,
      wordResult: complex.wordResult,
      groups: complex.groups,
      spellIds: complex.spellIds,
      spellResults: complex.spellResults,
      itemIds: complex.itemIds,
      itemResults: complex.itemResults,
      choiceResults: complex.choiceResults,
      wordResults: complex.wordResults,
      thief: complex.thief,
      rogueId: complex.thiefSuccess,
      rogueRecord,
      actions: complex.actions
    });
    const configuredMagic = complex.spellIds.filter((id, slot) => id !== 0 && (complex.spellResults[slot] ?? 0) !== 0).length;
    const configuredItems = complex.itemIds.filter((id, slot) => id !== 0 && (complex.itemResults[slot] ?? 0) !== 0).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Complex Encounter ${id}`} subtitle={messageSnippet(project, complex.prompt) || "No prompt string"} onOpen={open} />
        <EncounterTargetStatus actions={complex.actions} sources={sources} />
        <div className="encounter-target-facts">
          <span>{configuredMagic} magic response{configuredMagic === 1 ? "" : "s"}</span>
          <span>{configuredItems} item response{configuredItems === 1 ? "" : "s"}</span>
          <span>{complex.thief ? `Has Rogue Encounter ${complex.thiefSuccess || "unset"}` : "No Rogue Encounter"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "thiefEncounter") {
    const rogue = record as Project["thiefEncounters"][number];
    const enabledCount = (rogue.typeFlags ?? []).slice(0, 8).filter(Boolean).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Rogue Encounter ${id}`} subtitle={`${enabledCount}/8 rogue actions enabled`} onOpen={open} />
        <div className="encounter-target-facts">
          <span>{rogueSpellPathSummary(rogue, ROGUE_OPEN_LOCK_SPELL_PATH)}</span>
          <span>{rogueSpellPathSummary(rogue, ROGUE_DISARM_TRAP_SPELL_PATH)}</span>
          <span>{Boolean(rogue.typeFlags?.[9]) ? "Trap armed" : "No armed trap"}</span>
        </div>
      </div>
    );
  }
  const timed = record as Project["timedEncounters"][number];
  return (
    <div className="encounter-target-card">
      <EncounterTargetCardHeader title={`Time Encounter ${id}`} subtitle={timedEncounterEligibilitySummary(timed)} onOpen={open} />
      <div className="encounter-target-facts">
        <span>{timed.percent}% chance</span>
        <span>{timed.door > 0 ? `Runs Extra AP ${timed.door}` : "No Extra AP target"}</span>
        <span>{timed.locationKind === "any" ? "Any location" : `${timed.locationKind} level ${timed.requiredLevel}`}</span>
      </div>
    </div>
  );
}

function EncounterTargetCardHeader({ title, subtitle, onOpen, buttonLabel = "Open in Encounters" }: { title: string; subtitle: string; onOpen?: () => void; buttonLabel?: string }) {
  return (
    <header className="encounter-target-card-header">
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      {onOpen && (
        <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
          {buttonLabel}
        </button>
      )}
    </header>
  );
}

function EncounterTargetStatus({ actions, sources }: { actions: EncounterActionRow[]; sources: EncounterDecisionSource[] }) {
  const resultCounts = resultStatusCounts(actions);
  const warningCount = sources.filter((source) => source.status !== "visible" && source.result !== 0).length;
  return (
    <>
      <div className="encounter-target-status">
        <span>{resultCounts.visible} visible</span>
        <span>{resultCounts.empty} empty</span>
        <span>{sources.length} response path{sources.length === 1 ? "" : "s"}</span>
      </div>
      {warningCount > 0 && (
        <p className="field-warning">{warningCount} response path{warningCount === 1 ? "" : "s"} route to an empty, missing, or out-of-range result.</p>
      )}
    </>
  );
}

function encounterResultRecordPreview(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  targetType: Exclude<RealmzTargetRecordKind, "message" | "questLabel">,
  targetId: number
) {
  if (targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="battle" id={targetId} record={record} /> : null;
  }
  if (targetType === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="monster" id={targetId} record={record} /> : null;
  }
  if (targetType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="treasure" id={targetId} record={record} /> : null;
  }
  if (targetType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="shop" id={targetId} record={record} /> : null;
  }
  if (targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="simpleEncounter" id={targetId} record={record} /> : null;
  }
  if (targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="complexEncounter" id={targetId} record={record} /> : null;
  }
  if (targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="thiefEncounter" id={targetId} record={record} /> : null;
  }
  const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
  return record ? <EncounterTargetCard project={project} recordType="timedEncounter" id={targetId} record={record} /> : null;
}

function messageSnippet(project: Project, id: number) {
  if (id <= 0) return "";
  const text = project.messages?.find((record) => record.id === id)?.text ?? "";
  return text ? `Prompt ${id}: ${shortSnippet(text, 84)}` : `Prompt string ${id}`;
}

function EncounterActionRowEditor({
  project,
  catalog,
  slot,
  row,
  onUpdate,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
}) {
  const rowOption = actionOptionFor(row.rawCode);
  const targetType = realmzScriptStepDescriptorFor(row.rawCode).targetType;
  return (
    <div className="script-encounter-action-row">
      <header>
        <div>
          <strong>Action Row {slot}</strong>
          <small>{rowOption ? `${rowOption.category} | ${rowOption.description}` : "Empty action row"}</small>
        </div>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onUpdate({ rawCode: 0, id: 0 })}>
          Clear Row
        </button>
      </header>
      <label>
        <span>Opcode</span>
        <select value={row.rawCode} onChange={(event) => onUpdate({ rawCode: Number(event.currentTarget.value) })}>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.code} {option.shortLabel}</option>
          ))}
        </select>
      </label>
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Action Target"
        emptyLabel="No action target"
        opcode={row.rawCode}
        value={row.id}
        createRecordType={targetType}
        onCommit={(next) => onUpdate({ id: next })}
        onCreateTarget={(targetId) => {
          if (targetType) onCreateTarget(targetType, targetId);
        }}
      />
    </div>
  );
}

function BattleGridEditor({
  project,
  catalog,
  grid,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  grid: number[];
  onCommit: (index: number, value: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, grid.findIndex((value) => value !== 0)));
  const selectedValue = grid[selectedIndex] ?? 0;
  const selectedMonsterId = Math.abs(selectedValue);
  const [placementMonsterId, setPlacementMonsterId] = useState(selectedMonsterId);
  const [forceFriend, setForceFriend] = useState(selectedValue < 0);
  const [eraseMode, setEraseMode] = useState(false);
  const row = Math.floor(selectedIndex / 13);
  const col = selectedIndex % 13;
  const selectedDetail = monsterReferenceDetail(project, selectedValue, catalog);
  const placedCount = grid.filter(Boolean).length;
  const placementDetail = placementMonsterId ? monsterReferenceDetail(project, placementMonsterId, catalog) : "Choose a monster, then click cells to place it.";
  useEffect(() => {
    if (selectedMonsterId) {
      setPlacementMonsterId(selectedMonsterId);
      setForceFriend(selectedValue < 0);
    }
  }, [selectedIndex, selectedMonsterId, selectedValue]);
  const commitMonsterId = (monsterId: number) => {
    const sign = selectedValue < 0 ? -1 : 1;
    onCommit(selectedIndex, monsterId === 0 ? 0 : sign * Math.abs(monsterId));
  };
  const commitSide = (otherSide: boolean) => {
    if (selectedMonsterId === 0) return;
    onCommit(selectedIndex, otherSide ? -selectedMonsterId : selectedMonsterId);
  };
  const handleCellClick = (index: number) => {
    setSelectedIndex(index);
    if (eraseMode) {
      if ((grid[index] ?? 0) !== 0) onCommit(index, 0);
      return;
    }
    if (placementMonsterId) {
      onCommit(index, forceFriend ? -Math.abs(placementMonsterId) : Math.abs(placementMonsterId));
    }
  };
  return (
    <CollapsibleSection title="Monster Grid" eyebrow="13 x 13" count={`${placedCount} placed`} density="compact" className="script-battle-grid-section" defaultOpen>
      <div className="script-battle-placement-panel">
        <header>
          <strong>Placement</strong>
          <small>{placementDetail}</small>
        </header>
        <MonsterIdField
          project={project}
          catalog={catalog}
          label="Monster To Place"
          value={placementMonsterId}
          onCommit={(monsterId) => {
            setPlacementMonsterId(Math.abs(monsterId));
            setEraseMode(false);
          }}
          compact
        />
        <label className="script-target-checkbox">
          <span>Force Friend</span>
          <input type="checkbox" checked={forceFriend} disabled={!placementMonsterId || eraseMode} onChange={(event) => setForceFriend(event.currentTarget.checked)} />
        </label>
        <label className="script-target-checkbox">
          <span>Erase Mode</span>
          <input type="checkbox" checked={eraseMode} onChange={(event) => setEraseMode(event.currentTarget.checked)} />
        </label>
        <small className="script-battle-placement-note">
          Divinity allows up to 100 placed monsters. Force Friend stores a flipped battle-grid side value.
        </small>
      </div>
      <div className="script-battle-grid-editor" role="grid" aria-label="Battle monster grid">
        {Array.from({ length: 13 * 13 }, (_, index) => {
          const value = grid[index] ?? 0;
          const filled = value !== 0;
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`${index === selectedIndex ? "selected" : ""}${filled ? " filled" : ""}${value < 0 ? " other-side" : ""}`}
              title={filled ? monsterReferenceDetail(project, value, catalog) : `Empty battle cell ${Math.floor(index / 13)},${index % 13}`}
              onClick={() => handleCellClick(index)}
            >
              {filled ? Math.abs(value) : ""}
            </button>
          );
        })}
      </div>
      <div className="script-battle-selected-cell">
        <header>
          <strong>Selected Cell {col}, {row}</strong>
          <small>{selectedDetail}</small>
        </header>
        <MonsterIdField
          project={project}
          catalog={catalog}
          label="Selected Cell Monster"
          value={selectedMonsterId}
          onCommit={(monsterId) => {
            setPlacementMonsterId(Math.abs(monsterId));
            commitMonsterId(monsterId);
          }}
          compact
        />
        <label className="script-target-checkbox">
          <span>Force Friend / flip side</span>
          <input type="checkbox" checked={selectedValue < 0} disabled={selectedMonsterId === 0} onChange={(event) => commitSide(event.currentTarget.checked)} />
        </label>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onCommit(selectedIndex, 0)}>Clear Cell</button>
      </div>
    </CollapsibleSection>
  );
}

function MonsterIdField({
  project,
  catalog,
  label,
  value,
  onCommit,
  compact = false
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => monsterReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === Math.abs(value));
  const filteredOptions = useMemo(() => filterMonsterTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  return (
    <label className={`script-monster-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search monsters..."
        aria-label={`Search ${label} monsters`}
      />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty / none</option>
        {value !== 0 && !options.some((option) => option.value === Math.abs(value)) && <option value={Math.abs(value)}>Current monster ID {Math.abs(value)}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} raw monster ID`} />
      <small>{selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : filteredOptions.length === 0 && query.trim() ? "No monsters match this search." : monsterReferenceDetail(project, value, catalog)}</small>
    </label>
  );
}

function TreasureRewardField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  return (
    <div className="script-treasure-reward-field">
      <NumberField label={label} value={value} onCommit={onCommit} compact />
      <small>{treasureRewardHint(label, value)}</small>
    </div>
  );
}

function TreasureCatalogAdder({
  project,
  catalog,
  itemIds,
  onAddItem
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  onAddItem: (itemId: number) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const openSlot = firstOpenTreasureSlot(itemIds);
  const filteredOptions = useMemo(() => filterItemReferenceOptionsByCategory(options, query, category).slice(0, 36), [options, query, category]);
  return (
    <CollapsibleSection title="Add Items" eyebrow="Divinity categories" count={openSlot >= 0 ? `next open slot ${openSlot}` : "full"} density="compact" className="script-item-catalog-section" defaultOpen>
      <div className="script-item-category-tabs">
        {ITEM_REFERENCE_CATEGORIES.filter((entry) => entry.id !== "all").map((entry) => (
          <button key={entry.id} type="button" className={category === entry.id ? "active" : ""} onClick={() => setCategory(entry.id)}>
            <strong>{entry.label}</strong>
            {entry.range && <span>{entry.range}</span>}
          </button>
        ))}
      </div>
      <input className="script-item-catalog-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search items to add..." />
      <div className="script-item-catalog-list compact">
        {filteredOptions.map((option) => (
          <button key={option.key} type="button" disabled={openSlot < 0} onClick={() => onAddItem(option.value)}>
            <strong>{option.label}</strong>
            <span>{[option.detail, option.sourceState].filter(Boolean).join(" | ")}</span>
          </button>
        ))}
        {filteredOptions.length === 0 && <small>No items match this category/search.</small>}
      </div>
    </CollapsibleSection>
  );
}

function TreasureItemGrid({ project, catalog, itemIds, onCommit }: { project: Project; catalog?: LibraryCatalog | null; itemIds: number[]; onCommit: (index: number, value: number) => void }) {
  return (
    <CollapsibleSection title="Treasure Items" eyebrow="20 slots" count={`${itemIds.filter(Boolean).length} filled`} density="compact" className="script-treasure-grid-section" defaultOpen>
      <div className="script-treasure-item-grid">
        {Array.from({ length: 20 }, (_, index) => (
          <ItemIdField key={index} project={project} catalog={catalog} label={`Item ${index}`} value={itemIds[index] ?? 0} onCommit={(value) => onCommit(index, value)} compact />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ShopStockEditor({
  project,
  catalog,
  itemIds,
  quantities,
  desktopRuntime,
  projectDir,
  workspaceDir,
  onCommitItem,
  onCommitQuantity,
  onReplaceStock,
  onClearSlot
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  quantities: number[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onCommitItem: (index: number, value: number) => void;
  onCommitQuantity: (index: number, value: number) => void;
  onReplaceStock: (itemIds: number[], quantities: number[]) => void;
  onClearSlot: (index: number) => void;
}) {
  const [catalogCategory, setCatalogCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [changeAmount, setChangeAmount] = useState(1);
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const itemOptionsByValue = useMemo(() => new Map(itemOptions.map((option) => [option.value, option])), [itemOptions]);
  const catalogItems = useMemo(() => filterItemReferenceOptionsByCategory(itemOptions, catalogQuery, catalogCategory).slice(0, 72), [itemOptions, catalogQuery, catalogCategory]);
  const filledSlots = useMemo(() => {
    const slots: Array<{ slot: number; itemId: number; quantity: number; option: ItemReferenceOption | null }> = [];
    for (let index = 0; index < 1000; index += 1) {
      const itemId = itemIds[index] ?? 0;
      const quantity = quantities[index] ?? 0;
      if (itemId !== 0 || quantity !== 0) slots.push({ slot: index, itemId, quantity, option: itemOptionsByValue.get(itemId) ?? null });
    }
    return slots;
  }, [itemIds, itemOptionsByValue, quantities]);
  const adjustItem = (itemId: number) => {
    const next = adjustShopStock(itemIds, quantities, itemId, changeAmount);
    onReplaceStock(next.itemIds, next.quantities);
  };
  const filledCount = filledSlots.length;
  return (
    <CollapsibleSection title="Shop Inventory" eyebrow="shop stock" count={`${filledCount} filled`} density="compact" className="script-shop-stock-section" defaultOpen>
      <div className="script-shop-workbench">
        <section className="script-shop-catalog-editor" aria-label="Add shop stock">
          <header>
            <div>
              <strong>Add Stock</strong>
              <small>Pick a category like Divinity, then click an item to add or subtract the current quantity.</small>
            </div>
            <label>
              <span>Qty Change</span>
              <input type="number" value={changeAmount} onChange={(event) => setChangeAmount(clampShopQuantityDelta(Number(event.currentTarget.value) || 0))} />
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setChangeAmount((value) => (value === 0 ? -1 : -value))}>
                +/-
              </button>
            </label>
          </header>
          <div className="script-item-category-tabs">
            {ITEM_REFERENCE_CATEGORIES.map((entry) => (
              <button key={entry.id} type="button" className={catalogCategory === entry.id ? "active" : ""} onClick={() => setCatalogCategory(entry.id)}>
                <strong>{entry.label}</strong>
                {entry.range && <span>{entry.range}</span>}
              </button>
            ))}
          </div>
          <input className="script-item-catalog-search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.currentTarget.value)} placeholder="Search item name, ID, source, or use..." />
          <div className="script-shop-catalog-list">
            {catalogItems.map((option) => {
              const quantity = shopQuantityForItem(itemIds, quantities, option.value);
              return (
                <button key={option.key} type="button" onClick={() => adjustItem(option.value)}>
                  <ShopItemIcon option={option} project={project} catalog={catalog} desktopRuntime={desktopRuntime} projectDir={projectDir} workspaceDir={workspaceDir} />
                  <span>
                    <strong>{itemOptionDisplayName(option)}</strong>
                    <small>{[option.detail, option.sourceState].filter(Boolean).join(" | ")}</small>
                  </span>
                  <b>{quantity}</b>
                </button>
              );
            })}
            {catalogItems.length === 0 && <small>No items match this category/search.</small>}
          </div>
        </section>
        <section className="script-shop-inventory-panel" aria-label="Stocked shop items">
          <header>
            <div>
              <strong>Stocked Items</strong>
              <small>{filledCount ? "The rows Realmz copies into a new game shop inventory." : "No stock yet. Add items from the catalog."}</small>
            </div>
            <span>{filledCount} / 1000 slots</span>
          </header>
          <div className="script-shop-inventory-list">
            {filledSlots.map((row) => (
              <div key={row.slot} className="script-shop-stock-row">
                <ShopItemIcon option={row.option} project={project} catalog={catalog} itemId={row.itemId} desktopRuntime={desktopRuntime} projectDir={projectDir} workspaceDir={workspaceDir} />
                <div className="script-shop-stock-item">
                  <strong>{row.option ? itemOptionDisplayName(row.option) : `Raw item ${row.itemId}`}</strong>
                  <small>{row.option ? [row.option.detail, row.option.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, row.itemId, catalog)}</small>
                </div>
                <label className="script-shop-stock-id">
                  <span>Item ID</span>
                  <input type="number" value={row.itemId} onChange={(event) => onCommitItem(row.slot, Number(event.currentTarget.value) || 0)} />
                </label>
                <label className="script-shop-stock-qty">
                  <span>Qty</span>
                  <input type="number" min={0} max={255} value={row.quantity} onChange={(event) => onCommitQuantity(row.slot, clampShopQuantity(Number(event.currentTarget.value) || 0))} />
                </label>
                <span className="script-shop-stock-slot">Slot {row.slot}</span>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onClearSlot(row.slot)}>Clear</button>
              </div>
            ))}
            {filledSlots.length === 0 && <p className="script-shop-stock-empty">No stocked items yet. Search the catalog and add a quantity to start this shop.</p>}
          </div>
        </section>
      </div>
    </CollapsibleSection>
  );
}

function ShopItemIcon({
  option,
  project,
  catalog,
  itemId,
  desktopRuntime,
  projectDir,
  workspaceDir
}: {
  option: ItemReferenceOption | null;
  project: Project;
  catalog?: LibraryCatalog | null;
  itemId?: number;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
}) {
  const iconId = option?.iconId ?? null;
  const iconUrl = useIconPreviewUrl(iconId, project, catalog, { desktopRuntime, projectDir, workspaceDir });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [iconUrl]);
  const usableUrl = iconUrl && iconUrl !== failedUrl ? iconUrl : null;
  const fallback = option ? itemCategoryBadge(option.category) : itemId ? String(Math.abs(itemId) % 100) : "?";
  return (
    <span className="script-shop-item-icon" title={iconId ? `cicn ${iconId}` : itemId ? `Item ${itemId}` : "No item icon"}>
      {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{fallback}</i>}
    </span>
  );
}

function clampShopQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function clampShopQuantityDelta(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-255, Math.min(255, Math.trunc(value)));
}

function RequiredWeaponField({ project, catalog, value, onCommit, compact = false }: { project: Project; catalog?: LibraryCatalog | null; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const displayValue = monsterRequiredWeaponDisplayCode(value);
  const weaponOptions = useMemo(() => {
    const byCode = new Map(
      itemReferenceOptions(project, catalog)
        .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
        .map((item) => [item.value, item])
    );
    return Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = byCode.get(code);
      return {
        value: code,
        label: item?.label ?? `Weapon ${code}`
      };
    });
  }, [catalog, project]);
  return (
    <label className={compact ? "script-number-field compact" : "script-number-field"}>
      <span>Required Weapon</span>
      <select value={displayValue} onChange={(event) => onCommit(monsterRequiredWeaponStoredCode(Number(event.currentTarget.value)))}>
        <option value={0}>All weapons</option>
        <option value={-1}>Blunt only</option>
        <option value={-2}>Sharp only</option>
        {weaponOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
}

function filterMonsterTargetOptions(options: ReturnType<typeof monsterReferenceOptions>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function treasureRewardHint(label: string, value: number) {
  if (value < 0) return `Random ${label.toLowerCase()} from 1 to ${Math.abs(value)}.`;
  if (value > 0) return `Fixed ${label.toLowerCase()} reward.`;
  return "No reward.";
}

function firstOpenTreasureSlot(itemIds: number[]) {
  for (let index = 0; index < 20; index += 1) {
    if ((itemIds[index] ?? 0) === 0) return index;
  }
  return -1;
}

function shopQuantityForItem(itemIds: number[], quantities: number[], itemId: number) {
  let total = 0;
  for (let index = 0; index < 1000; index += 1) {
    if ((itemIds[index] ?? 0) === itemId) total += Math.max(0, quantities[index] ?? 0);
  }
  return total;
}

function adjustShopStock(itemIds: number[], quantities: number[], itemId: number, delta: number) {
  const nextItems = [...itemIds];
  const nextQuantities = [...quantities];
  while (nextItems.length < 1000) nextItems.push(0);
  while (nextQuantities.length < 1000) nextQuantities.push(0);
  const existingIndex = nextItems.findIndex((candidate) => candidate === itemId);
  const slot = existingIndex >= 0 ? existingIndex : nextItems.findIndex((candidate, index) => candidate === 0 && (nextQuantities[index] ?? 0) === 0);
  if (slot < 0) return { itemIds: nextItems, quantities: nextQuantities };
  const current = existingIndex >= 0 ? Math.max(0, nextQuantities[slot] ?? 0) : 0;
  const nextQuantity = Math.max(0, Math.min(255, current + delta));
  if (nextQuantity === 0) {
    nextItems[slot] = 0;
    nextQuantities[slot] = 0;
  } else {
    nextItems[slot] = itemId;
    nextQuantities[slot] = nextQuantity;
  }
  return { itemIds: nextItems, quantities: nextQuantities };
}

function targetRecordExists(project: Project, recordType: RealmzTargetRecordKind, id: number) {
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
  return Boolean((records ?? []).some((record) => record.id === id));
}
