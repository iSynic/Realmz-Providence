import { useEffect, useMemo, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import { LibraryAsset, ProjectCommand, ScenarioSpellOverride } from "../../types";
import { SPELL_CASTER_CLASSES, SPELL_DAMAGE_TYPES, SPELL_RESIST_CLASSES, SPELL_TARGET_TYPES } from "../../rulesCatalog";
import { EmptyRulesState, NumberField, RuleSection, SelectField, SoundNumberField, SpellAnimationIconField, FastplotTileNumberField, TextField, CheckboxField } from "./RuleFields";
import { buildSpellEntries, previousSpellPackedId, nextSpellPackedId, selectedIdFor, spellCustomId, spellPackedId } from "./ruleUtils";
import { SpellRuleEntry, SpellRulesEditorProps } from "./ruleTypes";

const SPELL_EDITOR_HELP = "Browse packed Realmz spell IDs from shared Data S and create scenario-local custom spell overrides in Data Spell. Built-in spell classes are reference/copy sources.";
const SPELL_CLASS_HELP = "Spell IDs encode class, level, and slot. The Custom class is the scenario-owned class; copying a built-in spell here creates an editable Data Spell record.";
const SPELL_GOTO_HELP = "Select the exact packed spell ID. Realmz references spells by this packed value in scripts, encounters, castes, items, and combat logic.";
const SPELL_CREATE_HELP = "Copying a built-in spell creates or replaces the matching Custom-class Data Spell slot. The shared Data S catalog remains unchanged.";
const SPELL_CLEAR_HELP = "Clearing removes the scenario-local Data Spell override for this custom slot and returns it to an empty custom spell entry.";

export function SpellRulesEditor({ project, catalog, selectedEntity, queueAtlasUrl, onSelectEntity, onApplyCommand }: SpellRulesEditorProps) {
  const entries = useMemo(() => buildSpellEntries(project, catalog), [project, catalog]);
  const selectedPackedId = selectedIdFor(selectedEntity?.id, "rule-spell") ?? entries[0]?.packedId ?? 1101;
  const entry = entries.find((candidate) => candidate.packedId === selectedPackedId) ?? entries[0] ?? null;
  const [spellcasterClass, setSpellcasterClass] = useState(() => entry?.spellcasterClass ?? 0);
  useEffect(() => {
    if (entry) setSpellcasterClass(entry.spellcasterClass);
  }, [entry?.packedId]);
  const visibleEntries = entries.filter((candidate) => candidate.spellcasterClass === spellcasterClass);
  const selectedEntry = visibleEntries.find((candidate) => candidate.packedId === selectedPackedId) ?? visibleEntries[0] ?? entry;
  const selectPacked = (packedId: number) => onSelectEntity({ type: "record", id: `rule-spell:${packedId}` });
  const createCustomFrom = (source: SpellRuleEntry) => {
    const customId = spellCustomId(source.levelIndex, source.slotIndex);
    onApplyCommand({
      kind: "createSpellOverride",
      label: "Create custom spell",
      id: customId,
      template: { ...source.record, id: customId, displayName: source.record.displayName || `Custom Spell ${source.levelIndex + 1}-${source.slotIndex + 1}` }
    });
    selectPacked(spellPackedId(4, source.levelIndex, source.slotIndex));
  };
  return (
    <div className="rules-layout rules-layout-single">
      <section className="rules-selector rules-divinity-selector">
        <div className="rules-selector-title">
          <div>
            <h2>
              <TutorialTip title="Spell Editor" body={SPELL_EDITOR_HELP} side="right">
                <span>Spell Editor</span>
              </TutorialTip>
            </h2>
            <p>Browse Realmz spell classes the way Divinity does. Custom spells are scenario-local and writable.</p>
          </div>
          <small>{project.spellOverrides?.length ?? 0} custom spell(s)</small>
        </div>
        <div className="rules-record-picker">
          <SelectField label="Spellcaster Class" value={spellcasterClass} options={SPELL_CASTER_CLASSES} help={SPELL_CLASS_HELP} onCommit={(value) => {
            setSpellcasterClass(value);
            selectPacked(spellPackedId(value, 0, 0));
          }} />
          <div className="rules-step-buttons" aria-label="Step through spells">
            <button type="button" className="btn btn-secondary btn-xs" title="Previous spell" onClick={() => selectedEntry && selectPacked(previousSpellPackedId(selectedEntry))}>‹</button>
            <button type="button" className="btn btn-secondary btn-xs" title="Next spell" onClick={() => selectedEntry && selectPacked(nextSpellPackedId(selectedEntry))}>›</button>
          </div>
          <label>
            <TutorialTip title="Go To Spell" body={SPELL_GOTO_HELP} side="below">
              <span>Go To Spell</span>
            </TutorialTip>
            <select value={selectedEntry?.packedId ?? ""} onChange={(event) => selectPacked(Number(event.currentTarget.value))}>
              {visibleEntries.map((candidate) => (
                <option key={candidate.packedId} value={candidate.packedId}>
                  {candidate.packedId} {candidate.label}
                </option>
              ))}
            </select>
          </label>
          {selectedEntry?.spellcasterClass === 4 && !selectedEntry.hasScenarioVersion && (
            <button type="button" className="btn btn-primary btn-xs" title={SPELL_CREATE_HELP} onClick={() => createCustomFrom(selectedEntry)}>Create Custom Spell</button>
          )}
          {selectedEntry?.spellcasterClass !== 4 && selectedEntry && (
            <button type="button" className="btn btn-primary btn-xs" title={SPELL_CREATE_HELP} onClick={() => createCustomFrom(selectedEntry)}>Copy To Custom Slot</button>
          )}
          {selectedEntry?.spellcasterClass === 4 && selectedEntry.hasScenarioVersion && (
            <button type="button" className="btn btn-danger btn-xs" title={SPELL_CLEAR_HELP} onClick={() => onApplyCommand({ kind: "clearSpellOverride", label: "Remove custom spell", id: selectedEntry.customId })}>Clear Custom Spell</button>
          )}
        </div>
        {selectedEntry && (
          <div className="rules-selected-summary">
            <strong>{selectedEntry.packedId} {selectedEntry.label}</strong>
            <span>{SPELL_CASTER_CLASSES[selectedEntry.spellcasterClass]} level {selectedEntry.levelIndex + 1}, slot {selectedEntry.slotIndex + 1}</span>
            <b>{selectedEntry.hasScenarioVersion ? "Scenario custom" : selectedEntry.spellcasterClass === 4 ? "Empty custom slot" : "Built-in Realmz spell"}</b>
          </div>
        )}
      </section>
      <main className="rules-detail">
        {selectedEntry && (
          <SpellForm
            entry={selectedEntry}
            iconAssets={catalog?.assets ?? []}
            queueAtlasUrl={queueAtlasUrl}
            onCreateCustom={() => createCustomFrom(selectedEntry)}
            onApplyCommand={onApplyCommand}
          />
        )}
      </main>
    </div>
  );
}

function SpellForm({
  entry,
  iconAssets,
  queueAtlasUrl,
  onCreateCustom,
  onApplyCommand
}: {
  entry: SpellRuleEntry;
  iconAssets: LibraryAsset[];
  queueAtlasUrl: string | null;
  onCreateCustom: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const record = entry.record;
  const editable = entry.spellcasterClass === 4 && entry.hasScenarioVersion;
  const update = (changes: Partial<ScenarioSpellOverride>) => {
    if (!editable) return;
    onApplyCommand({ kind: "updateSpellOverride", label: "Update custom spell", id: entry.customId, changes });
  };
  return (
    <div className="rules-editor-stack">
      {!editable && (
        <div className="rules-help-callout">
          {entry.spellcasterClass === 4 ? "This custom slot is empty. Create it to edit this scenario's Data Spell table." : "Realmz loads this as a built-in spell from shared Data S. Copy it into a Custom slot to make a scenario-local editable version."}
          <button type="button" className="btn btn-primary btn-xs" title={SPELL_CREATE_HELP} onClick={onCreateCustom}>{entry.spellcasterClass === 4 ? "Create Custom Spell" : "Copy To Custom Slot"}</button>
        </div>
      )}
      <RuleSection title="Identity" badge="metadata" help="Spell name, catalog location, and description text. Built-in spells can be copied into custom slots before editing.">
        <TextField
          label="Name"
          value={record.displayName ?? ""}
          onCommit={(displayName) => {
            if (!editable) return;
            onApplyCommand({ kind: "updateCustomSpellName", label: "Update custom spell name", id: entry.customId, displayName });
          }}
          span
          disabled={!editable}
          help="The scenario-local spell name stored in the custom spell name resource."
        />
        <NumberField label="Spell ID" value={entry.packedId} disabled compact help="Packed Realmz spell ID, such as 1101 for Sorcerer level 1 slot 1." />
        <SelectField label="Spell Catalog" value={entry.spellcasterClass} options={SPELL_CASTER_CLASSES} onCommit={() => {}} disabled help="The Realmz spell catalog this entry belongs to." />
        <NumberField label="Level" value={entry.levelIndex + 1} disabled compact help="Spell level within the selected catalog." />
        <NumberField label="Spell No." value={entry.slotIndex + 1} disabled compact help="Slot number within this spell level." />
        <TextField label="Description / Note" value={record.description ?? ""} onCommit={(description) => update({ description })} wide disabled={!editable} help="Reference text shown by the editor for this spell." />
      </RuleSection>
      <RuleSection title="Casting Context" badge="editable" help="Where the spell can be cast and how Realmz chooses valid targets.">
        <div className="rules-field-subrow rules-checkbox-row">
          <CheckboxField label="Can Cast In Combat" checked={record.inCombat} onCommit={(inCombat) => update({ inCombat })} disabled={!editable} help="Allows this spell during combat." />
          <CheckboxField label="Can Cast In Camp" checked={record.inCamp} onCommit={(inCamp) => update({ inCamp })} disabled={!editable} help="Allows this spell from the camp/adventure spell interface." />
        </div>
        <SelectField label="Target Type" value={record.targetType} options={SPELL_TARGET_TYPES} onCommit={(targetType) => update({ targetType })} disabled={!editable} help="How Realmz interprets the spell's target area." />
        <NumberField label="Spell Size" value={record.size} onCommit={(size) => update({ size })} disabled={!editable} compact help="Target area size used by fixed-size and area spells." />
        <NumberField label="Fixed Target Count" value={record.fixedTargetNum} onCommit={(fixedTargetNum) => update({ fixedTargetNum })} disabled={!editable} compact help="Fixed number of targets when the spell uses fixed targeting." />
        <NumberField label="Can Rotate" value={record.canRotate} onCommit={(canRotate) => update({ canRotate })} disabled={!editable} compact help="Whether the spell target shape can rotate." />
      </RuleSection>
      <RuleSection title="Math" badge="editable" help="Range, saving throw, resistance, cost, and damage class values used by Realmz spell resolution.">
        <NumberField label="Fixed Range" value={record.range1} onCommit={(range1) => update({ range1 })} disabled={!editable} compact help="Base range value." />
        <NumberField label="Power Range" value={record.range2} onCommit={(range2) => update({ range2 })} disabled={!editable} compact help="Range value scaled by spell power when applicable." />
        <NumberField label="+/- To Hit %" value={record.toHitBonus} onCommit={(toHitBonus) => update({ toHitBonus })} disabled={!editable} compact help="Hit chance adjustment." />
        <NumberField label="+/- To DRV %" value={record.saveBonus} onCommit={(saveBonus) => update({ saveBonus })} disabled={!editable} compact help="Defense/resistance roll adjustment." />
        <NumberField label="+/- Resist / Level" value={record.resistAdjust} onCommit={(resistAdjust) => update({ resistAdjust })} disabled={!editable} compact help="Resistance adjustment per level." />
        <SelectField label="Resist Type" value={record.saveAdjust} options={["No Resist", "No DRVs", "Neither", ...SPELL_RESIST_CLASSES]} onCommit={(saveAdjust) => update({ saveAdjust })} disabled={!editable} help="Resistance behavior used by this spell." />
        <NumberField label="Base SP Cost" value={record.cost} onCommit={(cost) => update({ cost })} disabled={!editable} compact help="Spell point cost." />
        <NumberField label="Spell Class" value={record.spellClass} onCommit={(spellClass) => update({ spellClass })} disabled={!editable} compact hint="Summon effects may use this as a monster ID." help="Spell class value; summon effects may use it as a monster ID." />
        <SelectField label="Damage Type" value={record.damageType} options={SPELL_DAMAGE_TYPES} onCommit={(damageType) => update({ damageType })} disabled={!editable} help="Damage or effect family used by Realmz." />
      </RuleSection>
      <RuleSection title="Damage And Duration" badge="editable" help="Fixed and power-scaled damage and duration ranges.">
        <NumberField label="Fixed Damage Low" value={record.damage1} onCommit={(damage1) => update({ damage1 })} disabled={!editable} compact help="Low fixed damage value." />
        <NumberField label="Fixed Damage High" value={record.damage2} onCommit={(damage2) => update({ damage2 })} disabled={!editable} compact help="High fixed damage value." />
        <NumberField label="Power Damage Low" value={record.powerDamage1} onCommit={(powerDamage1) => update({ powerDamage1 })} disabled={!editable} compact help="Low power-scaled damage value." />
        <NumberField label="Power Damage High" value={record.powerDamage2} onCommit={(powerDamage2) => update({ powerDamage2 })} disabled={!editable} compact help="High power-scaled damage value." />
        <NumberField label="Fixed Duration Low" value={record.duration1} onCommit={(duration1) => update({ duration1 })} disabled={!editable} compact help="Low fixed duration value." />
        <NumberField label="Fixed Duration High" value={record.duration2} onCommit={(duration2) => update({ duration2 })} disabled={!editable} compact help="High fixed duration value." />
        <NumberField label="Power Duration Low" value={record.powerDuration1} onCommit={(powerDuration1) => update({ powerDuration1 })} disabled={!editable} compact help="Low power-scaled duration value." />
        <NumberField label="Power Duration High" value={record.powerDuration2} onCommit={(powerDuration2) => update({ powerDuration2 })} disabled={!editable} compact help="High power-scaled duration value." />
      </RuleSection>
      <RuleSection title="Presentation" badge="editable" help="Spell animation icons, queue icon, sounds, and effect identifier.">
        <SpellAnimationIconField label="Cast Icon" value={record.spellLook1} assets={iconAssets} onCommit={(spellLook1) => update({ spellLook1 })} disabled={!editable} zeroMode="blank-cast" help="Animation shown while the spell is cast." />
        <SpellAnimationIconField label="Resolution Icon" value={record.spellLook2} assets={iconAssets} onCommit={(spellLook2) => update({ spellLook2 })} disabled={!editable} zeroMode="default-resolution" help="Animation shown when the spell resolves." />
        <FastplotTileNumberField label="Queue Icon" value={record.queueIcon} atlasUrl={queueAtlasUrl} onCommit={(queueIcon) => update({ queueIcon })} disabled={!editable} help="Small icon used in spell queue/combat displays." />
        <SoundNumberField label="Casting Sound" value={record.sound1} assets={iconAssets} onCommit={(sound1) => update({ sound1 })} disabled={!editable} help="Sound played when casting begins." />
        <SoundNumberField label="Resolution Sound" value={record.sound2} assets={iconAssets} onCommit={(sound2) => update({ sound2 })} disabled={!editable} help="Sound played when the spell resolves." />
        <NumberField label="Spell Effect" value={record.special} onCommit={(special) => update({ special })} disabled={!editable} compact help="Realmz effect handler identifier for this spell." />
      </RuleSection>
    </div>
  );
}
