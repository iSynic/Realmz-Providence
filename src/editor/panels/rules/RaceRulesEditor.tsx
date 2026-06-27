import { useMemo } from "react";
import { LibraryAsset, ScenarioRaceOverride } from "../../types";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_ATTRIBUTES, RACE_DESCRIPTOR_LABELS, REALMZ_CASTES, REALMZ_RACES, RESISTANCE_TYPES } from "../../rulesCatalog";
import { racePortraitSetFirstIconId } from "../../resourceIds";
import { AgeBands, ArrayFields, BitsetEditor, CheckboxMatrix, EmptyRulesState, IconNumberField, NumberField, PairGrid, RuleSection, RulesLayout, TextField } from "./RuleFields";
import { buildRaceEntries, RACE_RECORD_LIMIT, selectedIdFor, STANDARD_RACE_COUNT } from "./ruleUtils";
import { RulesEditorProps } from "./ruleTypes";

export function RaceRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
  const entries = useMemo(() => buildRaceEntries(project, catalog), [project, catalog]);
  const selectedId = selectedIdFor(selectedEntity?.id, "rule-race") ?? entries[0]?.id ?? 0;
  const entry = entries.find((candidate) => candidate.id === selectedId) ?? entries[0] ?? null;
  const customRaceIds = useMemo(() => new Set((project.raceOverrides ?? []).filter((record) => record.id >= STANDARD_RACE_COUNT).map((record) => record.id)), [project.raceOverrides]);
  const nextCustomRaceId = () => {
    for (let id = STANDARD_RACE_COUNT; id < RACE_RECORD_LIMIT; id += 1) {
      if (!customRaceIds.has(id)) return id;
    }
    return null;
  };
  const selectedIsStandardRace = (entry?.id ?? selectedId) < STANDARD_RACE_COUNT;
  const hasOpenCustomRaceSlot = nextCustomRaceId() !== null;
  const labelForRace = (race: { id: number; record: ScenarioRaceOverride }) => `${race.id}: ${raceDisplayName(race.id, race.record.displayName)}`;
  const createRaceFromId = (id: number) => {
    const source = entries.find((candidate) => candidate.id === id);
    const targetId = id < STANDARD_RACE_COUNT ? nextCustomRaceId() : id;
    if (targetId === null) return;
    onApplyCommand({ kind: "createRaceOverride", label: "Create race", id: targetId, template: source?.record });
    onSelectEntity({ type: "record", id: `rule-race:${targetId}` });
  };
  const createBlankCustomRace = () => {
    const targetId = nextCustomRaceId();
    if (targetId === null) return;
    onApplyCommand({ kind: "createRaceOverride", label: "Create custom race", id: targetId });
    onSelectEntity({ type: "record", id: `rule-race:${targetId}` });
  };
  const update = (changes: Partial<ScenarioRaceOverride>) => {
    if (!entry) return;
    if (entry.hasScenarioVersion) onApplyCommand({ kind: "updateRaceOverride", label: "Update race", id: entry.id, changes });
    else {
      const targetId = entry.id < STANDARD_RACE_COUNT ? nextCustomRaceId() : entry.id;
      if (targetId === null) return;
      onApplyCommand({ kind: "createRaceOverride", label: "Create race", id: targetId, template: { ...entry.record, ...changes } });
      onSelectEntity({ type: "record", id: `rule-race:${targetId}` });
    }
  };
  return (
    <RulesLayout
      title="Race Editor"
      note="Browse and edit the race table used by this scenario."
      records={entries}
      fallbackEntityType="race"
      catalog={catalog}
      selectedId={entry?.id ?? selectedId}
      onSelect={(id) => onSelectEntity({ type: "record", id: `rule-race:${id}` })}
      onCreate={createRaceFromId}
      onClear={(id) => onApplyCommand({ kind: "clearRaceOverride", label: "Clear scenario race", id })}
      maxRecords={RACE_RECORD_LIMIT}
      labelFor={labelForRace}
      summaryFor={(race) => `move ${race.record.baseMove}, max age ${race.record.maxAge}, ${race.record.canCaste.filter(Boolean).length} caste(s)`}
      fallbackLabelFor={(id) => REALMZ_RACES[id] || `Race ${id}`}
      fallbackSummaryFor={(id) => `Shared Realmz race ${id}`}
      recordNoun="Race"
      pickerLabel="Race"
      showGoToField={false}
      showCreateButton={false}
      createLabel={selectedIsStandardRace ? "Copy To New Race" : "Create This Race"}
      createHelp={selectedIsStandardRace ? "Copy this standard race into the next available custom race record." : "Create this custom race record from the current blank/default values."}
      createDisabled={selectedIsStandardRace && !hasOpenCustomRaceSlot}
      secondaryCreateLabel="New Custom Race"
      secondaryCreateHelp="Create a blank/default custom race in the next available custom race record."
      secondaryCreateDisabled={!hasOpenCustomRaceSlot}
      onSecondaryCreate={createBlankCustomRace}
    >
      {entry ? (
        <RaceForm
          record={entry.record}
          hasScenarioVersion={entry.hasScenarioVersion}
          iconAssets={catalog?.assets ?? []}
          onUpdate={update}
          isStandardRecord={entry.id < STANDARD_RACE_COUNT}
          createLabel={selectedIsStandardRace ? "Copy To New Race" : "Create This Race"}
          createDisabled={selectedIsStandardRace && !hasOpenCustomRaceSlot}
          onCreate={() => createRaceFromId(entry.id)}
        />
      ) : <EmptyRulesState label="race" selectedLabel={REALMZ_RACES[selectedId] || `Race ${selectedId}`} onCreate={() => onApplyCommand({ kind: "createRaceOverride", label: "Create race", id: selectedId })} />}
    </RulesLayout>
  );
}

function raceDisplayName(id: number, displayName?: string) {
  const name = displayName?.trim();
  if (name && name !== `Race ${id}`) return name;
  return REALMZ_RACES[id] || `Race ${id}`;
}

function RaceForm({
  record,
  hasScenarioVersion,
  iconAssets,
  onUpdate,
  isStandardRecord,
  createLabel,
  createDisabled,
  onCreate
}: {
  record: ScenarioRaceOverride;
  hasScenarioVersion: boolean;
  iconAssets: LibraryAsset[];
  onUpdate: (changes: Partial<ScenarioRaceOverride>) => void;
  isStandardRecord: boolean;
  createLabel: string;
  createDisabled: boolean;
  onCreate: () => void;
}) {
  const update = onUpdate;
  return (
    <div className="rules-editor-stack">
      {!hasScenarioVersion && (
        <div className="rules-help-callout">
          {isStandardRecord ? "This is the built-in Realmz race. Copy it into a custom race record to make a scenario-local editable version." : "This custom race slot is empty. Create it to edit this scenario's Data Race table."}
          <button type="button" className="btn btn-primary btn-xs" disabled={createDisabled} onClick={onCreate}>{createLabel}</button>
        </div>
      )}
      <RuleSection title="Identity And Miscellaneous" badge="mixed" help="Race name, portrait set, movement, regeneration, and broad combat modifiers. Names are editor/display labels unless a scenario storage path is proven.">
        <TextField label="Race Name" value={raceDisplayName(record.id, record.displayName)} onCommit={(displayName) => update({ displayName })} span help="Editor/display label for this race. Realmz normally resolves race names from shared strings, so behavior changes live in Data Race while labels remain display metadata unless proven otherwise." />
        <IconNumberField label="Default Portrait Set" value={record.defaultIconSet} assets={iconAssets} iconId={racePortraitSetFirstIconId} onCommit={(defaultIconSet) => update({ defaultIconSet })} help="Portrait set used by race selection and generated characters. Providence previews the first icon when the reference library can resolve it." />
        <NumberField label="Can Regenerate" value={record.canRegenerate} onCommit={(canRegenerate) => update({ canRegenerate })} compact help="Nonzero values enable natural regeneration behavior for this race." />
        <NumberField label="Base Movement Points" value={record.baseMove} onCommit={(baseMove) => update({ baseMove })} compact help="Base movement points before caste, map, and runtime modifiers." />
        <NumberField label="Magic Resistance +/-" value={record.magRes} onCommit={(magRes) => update({ magRes })} compact help="Race-level magic resistance modifier applied before other runtime effects." />
        <NumberField label="Two Handed Weapon +/-" value={record.twoHand} onCommit={(twoHand) => update({ twoHand })} compact longLabel help="Race modifier for two-handed weapon handling." />
        <NumberField label="Missile Weapon +/-" value={record.missile} onCommit={(missile) => update({ missile })} compact help="Race modifier for missile weapon handling." />
      </RuleSection>
      <RuleSection title="Attribute Minimums And Maximums" badge="editable" help="Race attribute limits used during character creation and advancement.">
        <PairGrid labels={RACE_ATTRIBUTES} values={record.minMax} onChange={(minMax) => update({ minMax })} leftLabel="Min" rightLabel="Max" />
      </RuleSection>
      <RuleSection title="Combat And DRV Modifiers" badge="editable" help="Race ability, hit, and resistance modifiers.">
        <ArrayFields title="+/- To Hit" labels={["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"]} values={record.plusMinusToHit} onChange={(plusMinusToHit) => update({ plusMinusToHit })} />
        <ArrayFields title="DRVs Spell Class" labels={RESISTANCE_TYPES} values={record.drvBonus} onChange={(drvBonus) => update({ drvBonus })} />
      </RuleSection>
      <RuleSection title="Possible Castes" badge="editable" help="Castes this race may choose. Check Scenario restrictions too, because a banned caste can still make a technically allowed race impossible to use.">
        <CheckboxMatrix labels={REALMZ_CASTES} values={record.canCaste} onChange={(canCaste) => update({ canCaste })} />
      </RuleSection>
      <RuleSection title="Usable Items" badge="editable" help="Broad item categories this race can use. Economy item restrictions can also require exact races, exact castes, descriptors, or caste classes.">
        <BitsetEditor labels={ITEM_CATEGORY_LABELS} values={record.itemTypes} onChange={(itemTypes) => update({ itemTypes })} />
      </RuleSection>
      <RuleSection title="Age Parameters" badge="editable" help="Age bands and stat changes applied by age group during character creation and aging.">
        <NumberField label="Max Age" value={record.maxAge} onCommit={(maxAge) => update({ maxAge })} compact help="Maximum age for this race. Mortality and age-change behavior also depends on adjacent race record fields preserved by the writer." />
        <AgeBands record={record} onChange={(ageRange, ageChange) => update({ ageRange, ageChange })} />
      </RuleSection>
      <RuleSection title="Conditions And Descriptors" badge="editable" help="Condition thresholds and race descriptor flags used by restrictions, item usability, and runtime checks.">
        <ArrayFields title="Condition Levels" labels={CONDITION_LABELS} values={record.conditions} onChange={(conditions) => update({ conditions })} compact />
        <BitsetEditor labels={RACE_DESCRIPTOR_LABELS} values={[record.descriptors]} onChange={(values) => update({ descriptors: values[0] ?? 0 })} />
      </RuleSection>
    </div>
  );
}
