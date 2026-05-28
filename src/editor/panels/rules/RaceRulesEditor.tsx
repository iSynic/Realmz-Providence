import { useMemo } from "react";
import { LibraryAsset, ScenarioRaceOverride } from "../../types";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_ATTRIBUTES, RACE_DESCRIPTOR_LABELS, REALMZ_CASTES, REALMZ_RACES, RESISTANCE_TYPES } from "../../rulesCatalog";
import { racePortraitSetFirstIconId } from "../../resourceIds";
import { AgeBands, ArrayFields, BitsetEditor, CheckboxMatrix, EmptyRulesState, IconNumberField, NumberField, PairGrid, RuleSection, RulesLayout, TextField } from "./RuleFields";
import { buildRaceEntries, selectedIdFor } from "./ruleUtils";
import { RulesEditorProps } from "./ruleTypes";

export function RaceRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
  const entries = useMemo(() => buildRaceEntries(project, catalog), [project, catalog]);
  const selectedId = selectedIdFor(selectedEntity?.id, "rule-race") ?? entries[0]?.id ?? 0;
  const entry = entries.find((candidate) => candidate.id === selectedId) ?? entries[0] ?? null;
  const update = (changes: Partial<ScenarioRaceOverride>) => {
    if (!entry) return;
    if (entry.hasScenarioVersion) onApplyCommand({ kind: "updateRaceOverride", label: "Update race", id: entry.id, changes });
    else onApplyCommand({ kind: "createRaceOverride", label: "Create race", id: entry.id, template: { ...entry.record, ...changes } });
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
      onCreate={(id) => {
        const source = entries.find((candidate) => candidate.id === id);
        onApplyCommand({ kind: "createRaceOverride", label: "Create race", id, template: source?.record });
      }}
      onClear={(id) => onApplyCommand({ kind: "clearRaceOverride", label: "Clear scenario race", id })}
      maxRecords={30}
      labelFor={(race) => `${race.id + 1}: ${race.record.displayName || REALMZ_RACES[race.id] || `Race ${race.id + 1}`}`}
      summaryFor={(race) => `move ${race.record.baseMove}, max age ${race.record.maxAge}, ${race.record.canCaste.filter(Boolean).length} caste(s)`}
      fallbackLabelFor={(id) => REALMZ_RACES[id] || `Race ${id + 1}`}
      fallbackSummaryFor={(id) => `Shared Realmz race ${id + 1}`}
      recordNoun="Race"
    >
      {entry ? <RaceForm record={entry.record} hasScenarioVersion={entry.hasScenarioVersion} iconAssets={catalog?.assets ?? []} onUpdate={update} /> : <EmptyRulesState label="race" selectedLabel={REALMZ_RACES[selectedId] || `Race ${selectedId + 1}`} onCreate={() => onApplyCommand({ kind: "createRaceOverride", label: "Create race", id: selectedId })} />}
    </RulesLayout>
  );
}

function RaceForm({ record, hasScenarioVersion, iconAssets, onUpdate }: { record: ScenarioRaceOverride; hasScenarioVersion: boolean; iconAssets: LibraryAsset[]; onUpdate: (changes: Partial<ScenarioRaceOverride>) => void }) {
  const update = onUpdate;
  return (
    <div className="rules-editor-stack">
      {!hasScenarioVersion && <div className="rules-help-callout">This is the built-in Realmz race. Changing a field creates a scenario-specific version of this race.</div>}
      <RuleSection title="Identity And Miscellaneous" badge="mixed" help="Race name, portrait set, movement, regeneration, and broad combat modifiers.">
        <TextField label="Race Name" value={record.displayName || REALMZ_RACES[record.id] || ""} onCommit={(displayName) => update({ displayName })} span help="Name shown for this race." />
        <IconNumberField label="Default Portrait Set" value={record.defaultIconSet} assets={iconAssets} iconId={racePortraitSetFirstIconId} onCommit={(defaultIconSet) => update({ defaultIconSet })} help="Portrait set used for this race." />
        <NumberField label="Can Regenerate" value={record.canRegenerate} onCommit={(canRegenerate) => update({ canRegenerate })} compact help="Whether this race regenerates naturally." />
        <NumberField label="Base Movement Points" value={record.baseMove} onCommit={(baseMove) => update({ baseMove })} compact help="Base movement points for this race." />
        <NumberField label="Magic Resistance +/-" value={record.magRes} onCommit={(magRes) => update({ magRes })} compact help="Race modifier to magic resistance." />
        <NumberField label="Two Handed Weapon +/-" value={record.twoHand} onCommit={(twoHand) => update({ twoHand })} compact longLabel help="Race modifier for two-handed weapons." />
        <NumberField label="Missile Weapon +/-" value={record.missile} onCommit={(missile) => update({ missile })} compact help="Race modifier for missile weapons." />
      </RuleSection>
      <RuleSection title="Attribute Minimums And Maximums" badge="editable" help="Race attribute limits used during character creation and advancement.">
        <PairGrid labels={RACE_ATTRIBUTES} values={record.minMax} onChange={(minMax) => update({ minMax })} leftLabel="Min" rightLabel="Max" />
      </RuleSection>
      <RuleSection title="Combat And DRV Modifiers" badge="editable" help="Race ability, hit, and resistance modifiers.">
        <ArrayFields title="+/- To Hit" labels={["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"]} values={record.plusMinusToHit} onChange={(plusMinusToHit) => update({ plusMinusToHit })} />
        <ArrayFields title="DRVs Spell Class" labels={RESISTANCE_TYPES} values={record.drvBonus} onChange={(drvBonus) => update({ drvBonus })} />
      </RuleSection>
      <RuleSection title="Possible Castes" badge="editable" help="Castes this race may choose.">
        <CheckboxMatrix labels={REALMZ_CASTES} values={record.canCaste} onChange={(canCaste) => update({ canCaste })} />
      </RuleSection>
      <RuleSection title="Usable Items" badge="editable" help="Item categories this race can use.">
        <BitsetEditor labels={ITEM_CATEGORY_LABELS} values={record.itemTypes} onChange={(itemTypes) => update({ itemTypes })} />
      </RuleSection>
      <RuleSection title="Age Parameters" badge="editable" help="Age bands and stat changes applied by age group.">
        <NumberField label="Max Age" value={record.maxAge} onCommit={(maxAge) => update({ maxAge })} compact help="Maximum age for this race." />
        <AgeBands record={record} onChange={(ageRange, ageChange) => update({ ageRange, ageChange })} />
      </RuleSection>
      <RuleSection title="Conditions And Descriptors" badge="editable" help="Condition levels and race descriptor flags.">
        <ArrayFields title="Condition Levels" labels={CONDITION_LABELS} values={record.conditions} onChange={(conditions) => update({ conditions })} compact />
        <BitsetEditor labels={RACE_DESCRIPTOR_LABELS} values={[record.descriptors]} onChange={(values) => update({ descriptors: values[0] ?? 0 })} />
      </RuleSection>
    </div>
  );
}
