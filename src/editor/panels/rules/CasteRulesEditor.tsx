import { useMemo } from "react";
import { LibraryAsset, ScenarioCasteOverride } from "../../types";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_ATTRIBUTES, RESISTANCE_TYPES } from "../../rulesCatalog";
import { ruleCasteName } from "../../ruleNames";
import { isPortraitIconAsset } from "../../resourceResolver";
import { ArrayFields, BitsetEditor, CheckboxField, EmptyRulesState, IconNumberField, MatrixFields, NumberField, PairGrid, RuleSection, RulesLayout, TextField, CasteProgressionGrid, VictoryPointsGrid } from "./RuleFields";
import { buildCasteEntries, CASTE_RECORD_LIMIT, isBlankImportedCasteRecord, selectedIdFor, STANDARD_CASTE_COUNT } from "./ruleUtils";
import { RulesEditorProps } from "./ruleTypes";

export function CasteRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
  const entries = useMemo(() => buildCasteEntries(project, catalog), [project, catalog]);
  const selectedId = selectedIdFor(selectedEntity?.id, "rule-caste") ?? entries[0]?.id ?? 0;
  const entry = entries.find((candidate) => candidate.id === selectedId) ?? entries[0] ?? null;
  const customCasteIds = useMemo(() => new Set((project.casteOverrides ?? []).filter((record) => record.id >= STANDARD_CASTE_COUNT && !isBlankImportedCasteRecord(record)).map((record) => record.id)), [project.casteOverrides]);
  const nextCustomCasteId = () => {
    for (let id = STANDARD_CASTE_COUNT; id < CASTE_RECORD_LIMIT; id += 1) {
      if (!customCasteIds.has(id)) return id;
    }
    return null;
  };
  const selectedIsStandardCaste = (entry?.id ?? selectedId) < STANDARD_CASTE_COUNT;
  const hasOpenCustomCasteSlot = nextCustomCasteId() !== null;
  const labelForCaste = (caste: { id: number; record: ScenarioCasteOverride }) => `${caste.id}: ${ruleCasteName(project, caste.id, caste.record.displayName)}`;
  const createCasteFromId = (id: number) => {
    const source = entries.find((candidate) => candidate.id === id);
    const targetId = id < STANDARD_CASTE_COUNT ? nextCustomCasteId() : id;
    if (targetId === null) return;
    onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id: targetId, template: source ? { ...source.record, displayName: ruleCasteName(project, id, source.record.displayName) } : undefined });
    onSelectEntity({ type: "record", id: `rule-caste:${targetId}` });
  };
  const createBlankCustomCaste = () => {
    const targetId = nextCustomCasteId();
    if (targetId === null) return;
    onApplyCommand({ kind: "createCasteOverride", label: "Create custom caste", id: targetId });
    onSelectEntity({ type: "record", id: `rule-caste:${targetId}` });
  };
  const update = (changes: Partial<ScenarioCasteOverride>) => {
    if (!entry) return;
    if (entry.hasScenarioVersion) onApplyCommand({ kind: "updateCasteOverride", label: "Update caste", id: entry.id, changes });
    else {
      const targetId = entry.id < STANDARD_CASTE_COUNT ? nextCustomCasteId() : entry.id;
      if (targetId === null) return;
      onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id: targetId, template: { ...entry.record, ...changes } });
      onSelectEntity({ type: "record", id: `rule-caste:${targetId}` });
    }
  };
  return (
    <RulesLayout
      title="Caste Editor"
      note="Browse and edit the caste table used by this scenario."
      records={entries}
      fallbackEntityType="caste"
      catalog={catalog}
      selectedId={entry?.id ?? selectedId}
      onSelect={(id) => onSelectEntity({ type: "record", id: `rule-caste:${id}` })}
      onCreate={createCasteFromId}
      onClear={(id) => onApplyCommand({ kind: "clearCasteOverride", label: "Clear scenario caste", id })}
      maxRecords={CASTE_RECORD_LIMIT}
      labelFor={labelForCaste}
      summaryFor={(caste) => `move ${caste.record.moveBonus}, class ${caste.record.casteClass}, ${caste.record.startItems.filter(Boolean).length} start item(s)`}
      fallbackLabelFor={(id) => ruleCasteName(project, id)}
      fallbackSummaryFor={(id) => `Shared Realmz caste ${id}`}
      recordNoun="Caste"
      pickerLabel="Caste"
      showGoToField={false}
      showCreateButton={false}
      createLabel={selectedIsStandardCaste ? "Copy To New Caste" : "Create This Caste"}
      createHelp={selectedIsStandardCaste ? "Copy this standard caste into the next available custom caste record." : "Create this custom caste record from the current blank/default values."}
      createDisabled={selectedIsStandardCaste && !hasOpenCustomCasteSlot}
      secondaryCreateLabel="New Custom Caste"
      secondaryCreateHelp="Create a blank/default custom caste in the next available custom caste record."
      secondaryCreateDisabled={!hasOpenCustomCasteSlot}
      onSecondaryCreate={createBlankCustomCaste}
    >
      {entry ? (
        <CasteForm
          record={entry.record}
          hasScenarioVersion={entry.hasScenarioVersion}
          iconAssets={catalog?.assets ?? []}
          onUpdate={update}
          onUpdateName={(displayName) => onApplyCommand({ kind: "updateCasteName", label: "Update caste name", id: entry.id, displayName })}
          isStandardRecord={entry.id < STANDARD_CASTE_COUNT}
          createLabel={selectedIsStandardCaste ? "Copy To New Caste" : "Create This Caste"}
          createDisabled={selectedIsStandardCaste && !hasOpenCustomCasteSlot}
          onCreate={() => createCasteFromId(entry.id)}
        />
      ) : <EmptyRulesState label="caste" selectedLabel={ruleCasteName(project, selectedId)} onCreate={() => onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id: selectedId })} />}
    </RulesLayout>
  );
}

function CasteForm({
  record,
  hasScenarioVersion,
  iconAssets,
  onUpdate,
  onUpdateName,
  isStandardRecord,
  createLabel,
  createDisabled,
  onCreate
}: {
  record: ScenarioCasteOverride;
  hasScenarioVersion: boolean;
  iconAssets: LibraryAsset[];
  onUpdate: (changes: Partial<ScenarioCasteOverride>) => void;
  onUpdateName: (displayName: string) => void;
  isStandardRecord: boolean;
  createLabel: string;
  createDisabled: boolean;
  onCreate: () => void;
}) {
  const update = onUpdate;
  return (
    <div className="rules-editor-stack rules-caste-editor-stack">
      {!hasScenarioVersion && (
        <div className="rules-help-callout">
          {isStandardRecord ? "This is the built-in Realmz caste. Copy it into a custom caste record to make a scenario-local editable version." : "This custom caste slot is empty. Create it to edit this scenario's Data Caste table."}
          <button type="button" className="btn btn-primary btn-xs" disabled={createDisabled} onClick={onCreate}>{createLabel}</button>
        </div>
      )}
      <div className="rules-section-group">
        <RuleSection title="Identity And Class" badge="mixed" help="Caste label, class category, icon, and broad weapon flags. Realmz reads caste labels from the global Data Files:Custom Names resource, not from exported scenario Data Caste.">
          <TextField
            label="Caste Name"
            value={record.displayName ?? ""}
            onCommit={onUpdateName}
            span
            disabled={isStandardRecord || !hasScenarioVersion}
            help={isStandardRecord || !hasScenarioVersion ? "Read-only until this caste is copied or created as a custom Data Caste record." : "Providence project label only. Divinity writes custom caste names to the global Custom Names resource, not the portable scenario export; Providence exports only the non-name Data Caste fields."}
          />
          <NumberField label="Caste Class" value={record.casteClass} onCommit={(casteClass) => update({ casteClass })} compact help="Realmz caste category code used by item restrictions and class-like runtime checks." />
          <NumberField label="Minimum Age Group" value={record.minimumAgeGroup} onCommit={(minimumAgeGroup) => update({ minimumAgeGroup })} compact help="Minimum race age band allowed for this caste." />
          <IconNumberField label="Default Icon" value={record.defaultIcon} assets={iconAssets} assetPreference={isPortraitIconAsset} onCommit={(defaultIcon) => update({ defaultIcon })} compact help="Portrait icon shown for this caste in selection menus when the reference library can resolve it." />
          <div className="rules-field-subrow rules-checkbox-row rules-checkbox-row-compact">
            <CheckboxField label="Can Use Missile Weapons" checked={record.canUseMissile !== 0} onCommit={(canUseMissile) => update({ canUseMissile: canUseMissile ? 1 : 0 })} help="Allows this caste to use missile weapons." />
            <CheckboxField label="Missile Bonus Damage" checked={record.getsMissileBonus !== 0} onCommit={(getsMissileBonus) => update({ getsMissileBonus: getsMissileBonus ? 1 : 0 })} help="Allows missile weapon bonus damage." />
          </div>
        </RuleSection>
        <RuleSection title="Stats And Movement" badge="editable" help="Caste attribute limits, movement, resistance, and stamina modifiers applied on top of the selected race.">
          <div className="rules-caste-stats-layout">
            <PairGrid labels={RACE_ATTRIBUTES} values={record.minMax} onChange={(minMax) => update({ minMax })} leftLabel="Min" rightLabel="Max" />
            <div className="rules-caste-stat-modifiers">
              <NumberField label="Move Bonus" value={record.moveBonus} onCommit={(moveBonus) => update({ moveBonus })} compact help="Movement point modifier." />
              <NumberField label="Magic Resistance" value={record.magRes} onCommit={(magRes) => update({ magRes })} compact help="Magic resistance modifier." />
              <NumberField label="Two Handed Weapon +/-" value={record.twoHand} onCommit={(twoHand) => update({ twoHand })} compact longLabel help="Two-handed weapon modifier." />
              <NumberField label="Max Stamina Bonus" value={record.maxStaminaBonus} onCommit={(maxStaminaBonus) => update({ maxStaminaBonus })} compact help="Maximum stamina modifier." />
            </div>
          </div>
        </RuleSection>
      </div>
      <div className="rules-section-group">
        <RuleSection title="Spellcasting" badge="editable" help="Spell catalogs and level ranges this caste can cast from. Spell selectors elsewhere resolve the same packed spell catalog/level/slot model.">
          <MatrixFields rows={["Sorcerer", "Priest", "Enchanter", "Special"]} columns={["Enabled", "Start Level", "Max Level"]} values={record.spellcasters} onChange={(spellcasters) => update({ spellcasters })} />
          <NumberField label="Max Spells Per Round" value={record.maxSpellsAttacks} onCommit={(maxSpellsAttacks) => update({ maxSpellsAttacks })} compact longLabel help="Maximum spells this caste may cast per round." />
        </RuleSection>
        <RuleSection title="Bonus Attack Rounds" badge="attacks" help="Round/level thresholds for bonus attacks.">
          <ArrayFields title="Round At Which Bonus Attack Is Awarded" labels={["3 / 2", "2 / 1", "5 / 2", "3 / 1", "7 / 2", "4 / 1", "9 / 2", "5 / 1", "11 / 2", "6 / 1"]} values={record.attacks} onChange={(attacks) => update({ attacks })} compact />
        </RuleSection>
      </div>
      <div className="rules-section-group rules-caste-combat-progress-group">
        <RuleSection title="Combat Progression" badge="editable" help="Level-up combat progression, bonus attacks, and maximum attacks. These values shape how the caste improves over time, not just starting stats.">
          <CasteProgressionGrid record={record} onChange={update} />
          <NumberField label="Bonus Attacks (x 1/2)" value={record.bonusAttacks} onCommit={(bonusAttacks) => update({ bonusAttacks })} compact longLabel help="Bonus attacks are recorded in half-attack steps." />
          <NumberField label="Max Attacks Per Round" value={record.maxAttacks} onCommit={(maxAttacks) => update({ maxAttacks })} compact longLabel help="Maximum attacks this caste may make per round." />
        </RuleSection>
      </div>
      <div className="rules-section-group">
        <RuleSection title="Initial Items And Gold" badge="editable" help="Starting gold and item IDs granted to new characters of this caste. Item IDs should resolve in Economy or the shared item library.">
          <NumberField label="Starting Gold" value={record.startMoney} onCommit={(startMoney) => update({ startMoney })} compact help="Gold given to new characters of this caste." />
          <ArrayFields title="Starting Items" labels={Array.from({ length: 20 }, (_, index) => `Item ${index}`)} values={record.startItems} onChange={(startItems) => update({ startItems })} compact />
        </RuleSection>
      </div>
      <div className="rules-section-group">
        <RuleSection title="Victory Points" badge="levels" help="Experience points required for each level. Check party balance when changing this table because it changes advancement pacing.">
          <VictoryPointsGrid values={record.victory} onChange={(victory) => update({ victory })} />
        </RuleSection>
      </div>
      <div className="rules-section-group">
        <RuleSection title="Usable Items" badge="editable" help="Broad item categories this caste can use. Economy items may also require exact caste IDs or caste class values.">
          <BitsetEditor labels={ITEM_CATEGORY_LABELS} values={record.itemTypes} onChange={(itemTypes) => update({ itemTypes })} />
        </RuleSection>
      </div>
      <div className="rules-caste-conditions-section">
        <RuleSection title="Conditions" badge="editable" help="Levels at which this caste gains conditions. These are source-backed condition thresholds rather than descriptive text." wide>
          <ArrayFields title="Condition Levels" labels={CONDITION_LABELS} values={record.conditions} onChange={(conditions) => update({ conditions })} compact />
        </RuleSection>
      </div>
    </div>
  );
}
