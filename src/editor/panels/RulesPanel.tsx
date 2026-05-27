import { ReactNode, useEffect, useMemo, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../browser/library";
import { LibraryAsset, LibraryCatalog, Project, ProjectCommand, ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride, SelectedEntity } from "../types";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_ATTRIBUTES, RACE_DESCRIPTOR_LABELS, REALMZ_CASTES, REALMZ_RACES, RESISTANCE_TYPES, SPELL_CASTER_CLASSES, SPELL_DAMAGE_TYPES, SPELL_RESIST_CLASSES, SPELL_TARGET_TYPES } from "../rulesCatalog";

type RulesFamily = "spells" | "races" | "castes";

export function RulesPanel({
  project,
  catalog,
  activeEditor,
  selectedEntity,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [family, setFamily] = useState<RulesFamily>(() => normalizeFamily(activeEditor));
  useEffect(() => setFamily(normalizeFamily(activeEditor)), [activeEditor]);
  return (
    <section className="rules-workbench">
      <header className="domain-header">
        <div>
          <h1>Rules</h1>
          <p>Browse Realmz spells, races, and castes, then customize the records this scenario is allowed to override.</p>
        </div>
        <small>{project.scenario.name}</small>
      </header>
      <div className="rules-tabs" role="tablist" aria-label="Rules editor">
        {(["spells", "races", "castes"] as RulesFamily[]).map((candidate) => (
          <button key={candidate} type="button" className={family === candidate ? "active" : ""} onClick={() => setFamily(candidate)}>
            {familyLabel(candidate)}
            <b>{overrideCount(project, candidate)}</b>
          </button>
        ))}
      </div>
      {family === "spells" && <SpellRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "races" && <RaceRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "castes" && <CasteRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
    </section>
  );
}

type SpellRuleEntry = {
  packedId: number;
  customId: number;
  spellcasterClass: number;
  levelIndex: number;
  slotIndex: number;
  label: string;
  record: ScenarioSpellOverride;
  hasScenarioVersion: boolean;
};

type RaceRuleEntry = {
  id: number;
  record: ScenarioRaceOverride;
  hasScenarioVersion: boolean;
};

type CasteRuleEntry = {
  id: number;
  record: ScenarioCasteOverride;
  hasScenarioVersion: boolean;
};

function buildSpellEntries(project: Project, catalog: LibraryCatalog | null): SpellRuleEntry[] {
  const scenario = new Map((project.spellOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioSpellOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "spell") continue;
    const packedId = num(entity.summary.packedSpellId);
    const spellcasterClass = num(entity.summary.spellcasterClass);
    const levelIndex = num(entity.summary.spellLevel) - 1;
    const slotIndex = num(entity.summary.spellSlot);
    if (!Number.isInteger(packedId) || slotIndex < 0 || slotIndex >= 12) continue;
    library.set(packedId, spellFromSummary(entity.summary, spellCustomId(levelIndex, slotIndex)));
  }
  const entries: SpellRuleEntry[] = [];
  for (let spellcasterClass = 0; spellcasterClass < SPELL_CASTER_CLASSES.length; spellcasterClass += 1) {
    for (let levelIndex = 0; levelIndex < 7; levelIndex += 1) {
      for (let slotIndex = 0; slotIndex < 12; slotIndex += 1) {
        const packedId = spellPackedId(spellcasterClass, levelIndex, slotIndex);
        const customId = spellCustomId(levelIndex, slotIndex);
        const scenarioRecord = spellcasterClass === 4 ? scenario.get(customId) ?? null : null;
        const record = scenarioRecord ?? library.get(packedId) ?? emptySpellView(customId, packedId, spellcasterClass, levelIndex, slotIndex);
        entries.push({
          packedId,
          customId,
          spellcasterClass,
          levelIndex,
          slotIndex,
          label: record.displayName || `Level ${levelIndex + 1} Spell ${slotIndex + 1}`,
          record,
          hasScenarioVersion: Boolean(scenarioRecord)
        });
      }
    }
  }
  return entries;
}

function spellFromSummary(summary: Record<string, unknown>, id: number): ScenarioSpellOverride {
  return {
    id,
    range1: num(summary.range1),
    range2: num(summary.range2),
    queueIcon: num(summary.queueIcon),
    toHitBonus: num(summary.toHitBonus),
    saveBonus: num(summary.saveBonus),
    fixedTargetNum: num(summary.fixedTargetNum),
    canRotate: num(summary.canRotate),
    saveAdjust: num(summary.saveAdjust),
    cannot: num(summary.cannot),
    resistAdjust: num(summary.resistAdjust),
    cost: num(summary.cost),
    damage1: num(summary.damage1),
    damage2: num(summary.damage2),
    powerDamage1: num(summary.powerDamage1),
    powerDamage2: num(summary.powerDamage2),
    duration1: num(summary.duration1),
    duration2: num(summary.duration2),
    powerDuration1: num(summary.powerDuration1),
    powerDuration2: num(summary.powerDuration2),
    spellLook1: num(summary.spellLook1),
    spellLook2: num(summary.spellLook2),
    sound1: num(summary.sound1),
    sound2: num(summary.sound2),
    targetType: num(summary.targetType),
    size: num(summary.size),
    special: num(summary.special),
    damageType: num(summary.damageType),
    spellClass: num(summary.spellClass),
    inCombat: Boolean(summary.inCombat),
    inCamp: Boolean(summary.inCamp),
    displayName: str(summary.displayName),
    description: "",
    rawBytes: numArray(summary.rawBytes, 30),
    authored: false,
    provenance: undefined
  };
}

function emptySpellView(id: number, packedId: number, spellcasterClass: number, levelIndex: number, slotIndex: number): ScenarioSpellOverride {
  return {
    id,
    range1: 0,
    range2: 0,
    queueIcon: 0,
    toHitBonus: 0,
    saveBonus: 0,
    fixedTargetNum: 0,
    canRotate: 0,
    saveAdjust: 0,
    cannot: 0,
    resistAdjust: 0,
    cost: 0,
    damage1: 0,
    damage2: 0,
    powerDamage1: 0,
    powerDamage2: 0,
    duration1: 0,
    duration2: 0,
    powerDuration1: 0,
    powerDuration2: 0,
    spellLook1: 0,
    spellLook2: 0,
    sound1: 0,
    sound2: 0,
    targetType: 0,
    size: 0,
    special: 0,
    damageType: 0,
    spellClass: 0,
    inCombat: false,
    inCamp: false,
    displayName: spellcasterClass === 4 ? `Level ${levelIndex + 1} Spell ${slotIndex + 1}` : `Spell ${packedId}`,
    description: "",
    rawBytes: [],
    authored: false,
    provenance: undefined
  };
}

function spellPackedId(spellcasterClass: number, levelIndex: number, slotIndex: number) {
  return (spellcasterClass + 1) * 1000 + (levelIndex + 1) * 100 + slotIndex + 1;
}

function spellCustomId(levelIndex: number, slotIndex: number) {
  return levelIndex * 15 + slotIndex;
}

function previousSpellPackedId(entry: SpellRuleEntry) {
  const flat = entry.levelIndex * 12 + entry.slotIndex;
  const next = flat <= 0 ? 83 : flat - 1;
  return spellPackedId(entry.spellcasterClass, Math.floor(next / 12), next % 12);
}

function nextSpellPackedId(entry: SpellRuleEntry) {
  const flat = entry.levelIndex * 12 + entry.slotIndex;
  const next = flat >= 83 ? 0 : flat + 1;
  return spellPackedId(entry.spellcasterClass, Math.floor(next / 12), next % 12);
}

function SpellRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
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
            <h2>Spell Editor</h2>
            <p>Browse Realmz spell classes the way Divinity does. Custom spells are scenario-local and writable.</p>
          </div>
          <small>{project.spellOverrides?.length ?? 0} custom spell(s)</small>
        </div>
        <div className="rules-record-picker">
          <SelectField label="Spellcaster Class" value={spellcasterClass} options={SPELL_CASTER_CLASSES} onCommit={(value) => {
            setSpellcasterClass(value);
            selectPacked(spellPackedId(value, 0, 0));
          }} />
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => selectedEntry && selectPacked(previousSpellPackedId(selectedEntry))}>-</button>
          <label>
            <span>Go To Spell</span>
            <select value={selectedEntry?.packedId ?? ""} onChange={(event) => selectPacked(Number(event.currentTarget.value))}>
              {visibleEntries.map((candidate) => (
                <option key={candidate.packedId} value={candidate.packedId}>
                  {candidate.packedId} {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => selectedEntry && selectPacked(nextSpellPackedId(selectedEntry))}>+</button>
          {selectedEntry?.spellcasterClass === 4 && !selectedEntry.hasScenarioVersion && (
            <button type="button" className="btn btn-primary btn-xs" onClick={() => createCustomFrom(selectedEntry)}>Create Custom Spell</button>
          )}
          {selectedEntry?.spellcasterClass !== 4 && selectedEntry && (
            <button type="button" className="btn btn-primary btn-xs" onClick={() => createCustomFrom(selectedEntry)}>Copy To Custom Slot</button>
          )}
          {selectedEntry?.spellcasterClass === 4 && selectedEntry.hasScenarioVersion && (
            <button type="button" className="btn btn-danger btn-xs" onClick={() => onApplyCommand({ kind: "clearSpellOverride", label: "Remove custom spell", id: selectedEntry.customId })}>Clear Custom Spell</button>
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
  onCreateCustom,
  onApplyCommand
}: {
  entry: SpellRuleEntry;
  iconAssets: LibraryAsset[];
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
          {entry.spellcasterClass === 4 ? "This custom slot is empty. Create it to edit this scenario's custom spell table." : "Realmz loads this as a built-in spell. Copy it into a Custom slot to make a scenario-local editable version."}
          <button type="button" className="btn btn-primary btn-xs" onClick={onCreateCustom}>{entry.spellcasterClass === 4 ? "Create Custom Spell" : "Copy To Custom Slot"}</button>
        </div>
      )}
      <RuleSection title="Identity" badge="metadata">
        <TextField label="Name" value={record.displayName ?? ""} onCommit={(displayName) => update({ displayName })} disabled={!editable} />
        <NumberField label="Spell ID" value={entry.packedId} disabled compact />
        <SelectField label="Spell Catalog" value={entry.spellcasterClass} options={SPELL_CASTER_CLASSES} onCommit={() => {}} disabled />
        <NumberField label="Level" value={entry.levelIndex + 1} disabled compact />
        <NumberField label="Spell No." value={entry.slotIndex + 1} disabled compact />
        <TextField label="Description / Note" value={record.description ?? ""} onCommit={(description) => update({ description })} wide disabled={!editable} />
      </RuleSection>
      <RuleSection title="Casting Context" badge="editable">
        <CheckboxField label="Can Cast In Combat" checked={record.inCombat} onCommit={(inCombat) => update({ inCombat })} disabled={!editable} />
        <CheckboxField label="Can Cast In Camp" checked={record.inCamp} onCommit={(inCamp) => update({ inCamp })} disabled={!editable} />
        <SelectField label="Target Type" value={record.targetType} options={SPELL_TARGET_TYPES} onCommit={(targetType) => update({ targetType })} disabled={!editable} />
        <NumberField label="Spell Size" value={record.size} onCommit={(size) => update({ size })} disabled={!editable} compact />
        <NumberField label="Fixed Target Count" value={record.fixedTargetNum} onCommit={(fixedTargetNum) => update({ fixedTargetNum })} disabled={!editable} compact />
        <NumberField label="Can Rotate" value={record.canRotate} onCommit={(canRotate) => update({ canRotate })} disabled={!editable} compact />
      </RuleSection>
      <RuleSection title="Math" badge="editable">
        <NumberField label="Fixed Range" value={record.range1} onCommit={(range1) => update({ range1 })} disabled={!editable} compact />
        <NumberField label="Power Range" value={record.range2} onCommit={(range2) => update({ range2 })} disabled={!editable} compact />
        <NumberField label="+/- To Hit %" value={record.toHitBonus} onCommit={(toHitBonus) => update({ toHitBonus })} disabled={!editable} compact />
        <NumberField label="+/- To DRV %" value={record.saveBonus} onCommit={(saveBonus) => update({ saveBonus })} disabled={!editable} compact />
        <NumberField label="+/- Resist / Level" value={record.resistAdjust} onCommit={(resistAdjust) => update({ resistAdjust })} disabled={!editable} compact />
        <SelectField label="Resist Type" value={record.saveAdjust} options={["No Resist", "No DRVs", "Neither", ...SPELL_RESIST_CLASSES]} onCommit={(saveAdjust) => update({ saveAdjust })} disabled={!editable} />
        <NumberField label="Base SP Cost" value={record.cost} onCommit={(cost) => update({ cost })} disabled={!editable} compact />
        <NumberField label="Spell Class" value={record.spellClass} onCommit={(spellClass) => update({ spellClass })} disabled={!editable} compact hint="Summon effects may use this as a monster ID." />
        <SelectField label="Damage Type" value={record.damageType} options={SPELL_DAMAGE_TYPES} onCommit={(damageType) => update({ damageType })} disabled={!editable} />
      </RuleSection>
      <RuleSection title="Damage And Duration" badge="editable">
        <NumberField label="Fixed Damage Low" value={record.damage1} onCommit={(damage1) => update({ damage1 })} disabled={!editable} compact />
        <NumberField label="Fixed Damage High" value={record.damage2} onCommit={(damage2) => update({ damage2 })} disabled={!editable} compact />
        <NumberField label="Power Damage Low" value={record.powerDamage1} onCommit={(powerDamage1) => update({ powerDamage1 })} disabled={!editable} compact />
        <NumberField label="Power Damage High" value={record.powerDamage2} onCommit={(powerDamage2) => update({ powerDamage2 })} disabled={!editable} compact />
        <NumberField label="Fixed Duration Low" value={record.duration1} onCommit={(duration1) => update({ duration1 })} disabled={!editable} compact />
        <NumberField label="Fixed Duration High" value={record.duration2} onCommit={(duration2) => update({ duration2 })} disabled={!editable} compact />
        <NumberField label="Power Duration Low" value={record.powerDuration1} onCommit={(powerDuration1) => update({ powerDuration1 })} disabled={!editable} compact />
        <NumberField label="Power Duration High" value={record.powerDuration2} onCommit={(powerDuration2) => update({ powerDuration2 })} disabled={!editable} compact />
      </RuleSection>
      <RuleSection title="Presentation" badge="editable">
        <IconNumberField label="Cast Icon" value={record.spellLook1} assets={iconAssets} onCommit={(spellLook1) => update({ spellLook1 })} disabled={!editable} iconId={spellAnimationIconId} />
        <IconNumberField label="Resolution Icon" value={record.spellLook2} assets={iconAssets} onCommit={(spellLook2) => update({ spellLook2 })} disabled={!editable} iconId={spellAnimationIconId} />
        <IconNumberField label="Queue Icon" value={record.queueIcon} assets={iconAssets} onCommit={(queueIcon) => update({ queueIcon })} disabled={!editable} iconId={null} hint={(value) => value > 0 ? `Combat queue tile ${200 + value}` : "No queued spell icon"} />
        <SoundNumberField label="Casting Sound" value={record.sound1} assets={iconAssets} onCommit={(sound1) => update({ sound1 })} disabled={!editable} />
        <SoundNumberField label="Resolution Sound" value={record.sound2} assets={iconAssets} onCommit={(sound2) => update({ sound2 })} disabled={!editable} />
        <NumberField label="Spell Effect" value={record.special} onCommit={(special) => update({ special })} disabled={!editable} compact />
      </RuleSection>
    </div>
  );
}

function buildRaceEntries(project: Project, catalog: LibraryCatalog | null): RaceRuleEntry[] {
  const scenario = new Map((project.raceOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioRaceOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "race") continue;
    const id = num(entity.summary.index);
    if (!Number.isInteger(id) || id < 0 || id >= 30) continue;
    library.set(id, raceFromSummary(entity.summary, id));
  }
  return Array.from({ length: 30 }, (_, id) => {
    const scenarioRecord = scenario.get(id) ?? null;
    return {
      id,
      record: scenarioRecord ?? library.get(id) ?? emptyRaceView(id),
      hasScenarioVersion: Boolean(scenarioRecord)
    };
  });
}

function buildCasteEntries(project: Project, catalog: LibraryCatalog | null): CasteRuleEntry[] {
  const scenario = new Map((project.casteOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioCasteOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "caste") continue;
    const id = num(entity.summary.index);
    if (!Number.isInteger(id) || id < 0 || id >= 30) continue;
    library.set(id, casteFromSummary(entity.summary, id));
  }
  return Array.from({ length: 30 }, (_, id) => {
    const scenarioRecord = scenario.get(id) ?? null;
    return {
      id,
      record: scenarioRecord ?? library.get(id) ?? emptyCasteView(id),
      hasScenarioVersion: Boolean(scenarioRecord)
    };
  });
}

function raceFromSummary(summary: Record<string, unknown>, id: number): ScenarioRaceOverride {
  return {
    id,
    displayName: str(summary.displayName) || REALMZ_RACES[id] || `Race ${id + 1}`,
    plusMinusToHit: numArray(summary.plusMinusToHit, 8),
    specialAbility: numArray(summary.specialAbility, 14),
    drvBonus: numArray(summary.drvBonus, 8),
    attBonus: numArray(summary.attBonus, 6),
    minMax: numArray(summary.minMax, 12, 0),
    conditions: numArray(summary.conditions, 40),
    maxAge: num(summary.maxAge),
    doesNotDie: num(summary.doesNotDie),
    baseMove: num(summary.baseMove),
    magRes: num(summary.magRes),
    twoHand: num(summary.twoHand),
    missile: num(summary.missile),
    numOfAttacks: numArray(summary.numOfAttacks, 2),
    canCaste: numArray(summary.canCaste, 30),
    ageRange: numMatrix(summary.ageRange, 5, 2),
    ageChange: numMatrix(summary.ageChange, 5, 15),
    canRegenerate: num(summary.canRegenerate),
    defaultIconSet: num(summary.defaultIconSet),
    itemTypes: numArray(summary.itemTypes, 2),
    descriptors: num(summary.descriptors),
    rawBytes: numArray(summary.rawBytes, 408),
    authored: false,
    provenance: undefined
  };
}

function casteFromSummary(summary: Record<string, unknown>, id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: str(summary.displayName) || REALMZ_CASTES[id] || `Caste ${id + 1}`,
    specialAbility: numMatrix(summary.specialAbility, 2, 14),
    drvBonus: numArray(summary.drvBonus, 8),
    attBonus: numArray(summary.attBonus, 6),
    spellcasters: numMatrix(summary.spellcasters, 4, 3),
    minMax: numArray(summary.minMax, 12, 0),
    conditions: numArray(summary.conditions, 40),
    canUseMissile: num(summary.canUseMissile),
    getsMissileBonus: num(summary.getsMissileBonus),
    stamina: numArray(summary.stamina, 2),
    strength: numArray(summary.strength, 2),
    dodge: numArray(summary.dodge, 2),
    toHit: numArray(summary.toHit, 2),
    missile: numArray(summary.missile, 2),
    hand2Hand: numArray(summary.hand2Hand, 2),
    casteClass: num(summary.casteClass),
    minimumAgeGroup: num(summary.minimumAgeGroup),
    moveBonus: num(summary.moveBonus),
    magRes: num(summary.magRes),
    twoHand: num(summary.twoHand),
    maxStaminaBonus: num(summary.maxStaminaBonus),
    bonusAttacks: num(summary.bonusAttacks),
    maxAttacks: num(summary.maxAttacks),
    victory: numArray(summary.victory, 30),
    startMoney: num(summary.startMoney),
    startItems: numArray(summary.startItems, 20),
    attacks: numArray(summary.attacks, 10),
    itemTypes: numArray(summary.itemTypes, 2),
    defaultIcon: num(summary.defaultIcon),
    maxSpellsAttacks: num(summary.maxSpellsAttacks),
    spellsSoFar: num(summary.spellsSoFar),
    rawBytes: numArray(summary.rawBytes, 576),
    authored: false,
    provenance: undefined
  };
}

function emptyRaceView(id: number): ScenarioRaceOverride {
  return {
    id,
    displayName: REALMZ_RACES[id] || `Race ${id + 1}`,
    plusMinusToHit: new Array(8).fill(0),
    specialAbility: new Array(14).fill(0),
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    conditions: new Array(40).fill(0),
    maxAge: 70,
    doesNotDie: 0,
    baseMove: 12,
    magRes: 0,
    twoHand: 0,
    missile: 0,
    numOfAttacks: [2, 4],
    canCaste: new Array(30).fill(0),
    ageRange: [[14, 17], [18, 21], [22, 35], [36, 49], [50, 70]],
    ageChange: Array.from({ length: 5 }, () => new Array(15).fill(0)),
    canRegenerate: 0,
    defaultIconSet: 0,
    itemTypes: [0, 0],
    descriptors: 0,
    rawBytes: [],
    authored: false,
    provenance: undefined
  };
}

function emptyCasteView(id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: REALMZ_CASTES[id] || `Caste ${id + 1}`,
    specialAbility: [new Array(14).fill(0), new Array(14).fill(0)],
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    spellcasters: Array.from({ length: 4 }, () => new Array(3).fill(0)),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    conditions: new Array(40).fill(0),
    canUseMissile: 0,
    getsMissileBonus: 0,
    stamina: [0, 0],
    strength: [0, 0],
    dodge: [0, 0],
    toHit: [0, 0],
    missile: [0, 0],
    hand2Hand: [0, 0],
    casteClass: 0,
    minimumAgeGroup: 0,
    moveBonus: 0,
    magRes: 0,
    twoHand: 0,
    maxStaminaBonus: 0,
    bonusAttacks: 0,
    maxAttacks: 0,
    victory: new Array(30).fill(0),
    startMoney: 0,
    startItems: new Array(20).fill(0),
    attacks: new Array(10).fill(0),
    itemTypes: [0, 0],
    defaultIcon: 0,
    maxSpellsAttacks: 0,
    spellsSoFar: 0,
    rawBytes: [],
    authored: false,
    provenance: undefined
  };
}

function RaceRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
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
      <RuleSection title="Identity And Miscellaneous" badge="mixed">
        <TextField label="Race Name" value={record.displayName || REALMZ_RACES[record.id] || ""} onCommit={(displayName) => update({ displayName })} />
        <IconNumberField label="Default Portrait Set" value={record.defaultIconSet} assets={iconAssets} iconId={(value) => 251 + value * 6} onCommit={(defaultIconSet) => update({ defaultIconSet })} />
        <NumberField label="Can Regenerate" value={record.canRegenerate} onCommit={(canRegenerate) => update({ canRegenerate })} compact />
        <NumberField label="Base Movement Points" value={record.baseMove} onCommit={(baseMove) => update({ baseMove })} compact />
        <NumberField label="Magic Resistance +/-" value={record.magRes} onCommit={(magRes) => update({ magRes })} compact />
        <NumberField label="Two Handed Weapon +/-" value={record.twoHand} onCommit={(twoHand) => update({ twoHand })} compact />
        <NumberField label="Missile Weapon +/-" value={record.missile} onCommit={(missile) => update({ missile })} compact />
      </RuleSection>
      <RuleSection title="Attribute Minimums And Maximums" badge="editable">
        <PairGrid labels={RACE_ATTRIBUTES} values={record.minMax} onChange={(minMax) => update({ minMax })} leftLabel="Min" rightLabel="Max" />
      </RuleSection>
      <RuleSection title="Combat And DRV Modifiers" badge="editable">
        <ArrayFields title="+/- To Hit" labels={["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"]} values={record.plusMinusToHit} onChange={(plusMinusToHit) => update({ plusMinusToHit })} />
        <ArrayFields title="DRVs Spell Class" labels={RESISTANCE_TYPES} values={record.drvBonus} onChange={(drvBonus) => update({ drvBonus })} />
      </RuleSection>
      <RuleSection title="Possible Castes" badge="editable">
        <CheckboxMatrix labels={REALMZ_CASTES} values={record.canCaste} onChange={(canCaste) => update({ canCaste })} />
      </RuleSection>
      <RuleSection title="Usable Items" badge="editable">
        <BitsetEditor labels={ITEM_CATEGORY_LABELS} values={record.itemTypes} onChange={(itemTypes) => update({ itemTypes })} />
      </RuleSection>
      <RuleSection title="Age Parameters" badge="editable">
        <NumberField label="Max Age" value={record.maxAge} onCommit={(maxAge) => update({ maxAge })} compact />
        <AgeBands record={record} onChange={(ageRange, ageChange) => update({ ageRange, ageChange })} />
      </RuleSection>
      <RuleSection title="Conditions And Descriptors" badge="editable">
        <ArrayFields title="Condition Levels" labels={CONDITION_LABELS} values={record.conditions} onChange={(conditions) => update({ conditions })} compact />
        <BitsetEditor labels={RACE_DESCRIPTOR_LABELS} values={[record.descriptors]} onChange={(values) => update({ descriptors: values[0] ?? 0 })} />
      </RuleSection>
    </div>
  );
}

function CasteRulesEditor({ project, catalog, selectedEntity, onSelectEntity, onApplyCommand }: RulesEditorProps) {
  const entries = useMemo(() => buildCasteEntries(project, catalog), [project, catalog]);
  const selectedId = selectedIdFor(selectedEntity?.id, "rule-caste") ?? entries[0]?.id ?? 0;
  const entry = entries.find((candidate) => candidate.id === selectedId) ?? entries[0] ?? null;
  const update = (changes: Partial<ScenarioCasteOverride>) => {
    if (!entry) return;
    if (entry.hasScenarioVersion) onApplyCommand({ kind: "updateCasteOverride", label: "Update caste", id: entry.id, changes });
    else onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id: entry.id, template: { ...entry.record, ...changes } });
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
      onCreate={(id) => {
        const source = entries.find((candidate) => candidate.id === id);
        onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id, template: source?.record });
      }}
      onClear={(id) => onApplyCommand({ kind: "clearCasteOverride", label: "Clear scenario caste", id })}
      maxRecords={30}
      labelFor={(caste) => `${caste.id + 1}: ${caste.record.displayName || REALMZ_CASTES[caste.id] || `Caste ${caste.id + 1}`}`}
      summaryFor={(caste) => `move ${caste.record.moveBonus}, class ${caste.record.casteClass}, ${caste.record.startItems.filter(Boolean).length} start item(s)`}
      fallbackLabelFor={(id) => REALMZ_CASTES[id] || `Caste ${id + 1}`}
      fallbackSummaryFor={(id) => `Shared Realmz caste ${id + 1}`}
    >
      {entry ? <CasteForm record={entry.record} hasScenarioVersion={entry.hasScenarioVersion} iconAssets={catalog?.assets ?? []} onUpdate={update} /> : <EmptyRulesState label="caste" selectedLabel={REALMZ_CASTES[selectedId] || `Caste ${selectedId + 1}`} onCreate={() => onApplyCommand({ kind: "createCasteOverride", label: "Create caste", id: selectedId })} />}
    </RulesLayout>
  );
}

function CasteForm({ record, hasScenarioVersion, iconAssets, onUpdate }: { record: ScenarioCasteOverride; hasScenarioVersion: boolean; iconAssets: LibraryAsset[]; onUpdate: (changes: Partial<ScenarioCasteOverride>) => void }) {
  const update = onUpdate;
  return (
    <div className="rules-editor-stack">
      {!hasScenarioVersion && <div className="rules-help-callout">This is the built-in Realmz caste. Changing a field creates a scenario-specific version of this caste.</div>}
      <RuleSection title="Identity And Class" badge="mixed">
        <TextField label="Caste Name" value={record.displayName || REALMZ_CASTES[record.id] || ""} onCommit={(displayName) => update({ displayName })} />
        <NumberField label="Caste Class" value={record.casteClass} onCommit={(casteClass) => update({ casteClass })} compact />
        <NumberField label="Minimum Age Group" value={record.minimumAgeGroup} onCommit={(minimumAgeGroup) => update({ minimumAgeGroup })} compact />
        <IconNumberField label="Default Icon" value={record.defaultIcon} assets={iconAssets} onCommit={(defaultIcon) => update({ defaultIcon })} />
        <CheckboxField label="Can Use Missile Weapons" checked={record.canUseMissile !== 0} onCommit={(canUseMissile) => update({ canUseMissile: canUseMissile ? 1 : 0 })} />
        <CheckboxField label="Missile Bonus Damage" checked={record.getsMissileBonus !== 0} onCommit={(getsMissileBonus) => update({ getsMissileBonus: getsMissileBonus ? 1 : 0 })} />
      </RuleSection>
      <RuleSection title="Stats And Movement" badge="editable">
        <PairGrid labels={RACE_ATTRIBUTES} values={record.minMax} onChange={(minMax) => update({ minMax })} leftLabel="Min" rightLabel="Max" />
        <NumberField label="Move Bonus" value={record.moveBonus} onCommit={(moveBonus) => update({ moveBonus })} compact />
        <NumberField label="Magic Resistance" value={record.magRes} onCommit={(magRes) => update({ magRes })} compact />
        <NumberField label="Two Handed Weapon +/-" value={record.twoHand} onCommit={(twoHand) => update({ twoHand })} compact />
        <NumberField label="Max Stamina Bonus" value={record.maxStaminaBonus} onCommit={(maxStaminaBonus) => update({ maxStaminaBonus })} compact />
      </RuleSection>
      <RuleSection title="Combat Progression" badge="editable">
        <ArrayFields title="Level-Up Pairs" labels={["Stamina A", "Stamina B", "Strength A", "Strength B", "Dodge A", "Dodge B", "To Hit A", "To Hit B", "Missile A", "Missile B", "Hand2Hand A", "Hand2Hand B"]} values={[...record.stamina, ...record.strength, ...record.dodge, ...record.toHit, ...record.missile, ...record.hand2Hand]} onChange={(values) => update({ stamina: values.slice(0, 2), strength: values.slice(2, 4), dodge: values.slice(4, 6), toHit: values.slice(6, 8), missile: values.slice(8, 10), hand2Hand: values.slice(10, 12) })} />
        <NumberField label="Bonus Attacks" value={record.bonusAttacks} onCommit={(bonusAttacks) => update({ bonusAttacks })} compact />
        <NumberField label="Max Attacks" value={record.maxAttacks} onCommit={(maxAttacks) => update({ maxAttacks })} compact />
      </RuleSection>
      <RuleSection title="Victory Points" badge="levels">
        <ArrayFields title="Points Required" labels={victoryPointLabels()} values={record.victory} onChange={(victory) => update({ victory })} compact />
      </RuleSection>
      <RuleSection title="Bonus Attack Rounds" badge="attacks">
        <ArrayFields title="Round At Which Bonus Attack Is Awarded" labels={["3 / 2", "2 / 1", "5 / 2", "3 / 1", "7 / 2", "4 / 1", "9 / 2", "5 / 1", "11 / 2", "6 / 1"]} values={record.attacks} onChange={(attacks) => update({ attacks })} compact />
      </RuleSection>
      <RuleSection title="Spellcasting" badge="editable">
        <MatrixFields rows={["Sorcerer", "Priest", "Enchanter", "Special"]} columns={["Enabled", "Start Level", "Max Level"]} values={record.spellcasters} onChange={(spellcasters) => update({ spellcasters })} />
        <NumberField label="Max Spells Per Round" value={record.maxSpellsAttacks} onCommit={(maxSpellsAttacks) => update({ maxSpellsAttacks })} compact />
      </RuleSection>
      <RuleSection title="Usable Items" badge="editable">
        <BitsetEditor labels={ITEM_CATEGORY_LABELS} values={record.itemTypes} onChange={(itemTypes) => update({ itemTypes })} />
      </RuleSection>
      <RuleSection title="Initial Items And Gold" badge="editable">
        <NumberField label="Starting Gold" value={record.startMoney} onCommit={(startMoney) => update({ startMoney })} compact />
        <ArrayFields title="Starting Items" labels={Array.from({ length: 20 }, (_, index) => `Item ${index}`)} values={record.startItems} onChange={(startItems) => update({ startItems })} compact />
      </RuleSection>
      <RuleSection title="Conditions" badge="editable">
        <ArrayFields title="Condition Levels" labels={CONDITION_LABELS} values={record.conditions} onChange={(conditions) => update({ conditions })} compact />
      </RuleSection>
    </div>
  );
}

type RulesEditorProps = {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
};

function RulesLayout<T extends { id: number }>({
  title,
  note,
  records,
  fallbackEntityType,
  catalog,
  selectedId,
  onSelect,
  onCreate,
  onClear,
  maxRecords,
  labelFor,
  summaryFor,
  fallbackLabelFor,
  fallbackSummaryFor,
  children
}: {
  title: string;
  note: string;
  records: T[];
  fallbackEntityType: string;
  catalog: LibraryCatalog | null;
  selectedId: number;
  onSelect: (id: number) => void;
  onCreate: (id: number) => void;
  onClear: (id: number) => void;
  maxRecords: number;
  labelFor: (record: T) => string;
  summaryFor: (record: T) => string;
  fallbackLabelFor: (id: number) => string;
  fallbackSummaryFor: (id: number) => string;
  children: ReactNode;
}) {
  const libraryCount = catalog?.entities.filter((entity) => entity.type === fallbackEntityType).length ?? 0;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;
  const selectedIsScenario = selectedRecord ? entryHasScenarioVersion(selectedRecord) : false;
  const scenarioCount = records.filter(entryHasScenarioVersion).length;
  const selectedLabel = selectedRecord ? labelFor(selectedRecord) : fallbackLabelFor(selectedId);
  const selectedSummary = selectedRecord ? summaryFor(selectedRecord) : fallbackSummaryFor(selectedId);
  const previousId = selectedId <= 0 ? maxRecords - 1 : selectedId - 1;
  const nextId = selectedId >= maxRecords - 1 ? 0 : selectedId + 1;
  return (
    <div className="rules-layout rules-layout-single">
      <section className="rules-selector">
        <div className="rules-selector-title">
          <div>
            <h2>{title}</h2>
            <p>{note}</p>
          </div>
          <small>{scenarioCount} scenario custom, {libraryCount} built-in reference(s)</small>
        </div>
        <div className="rules-record-picker">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelect(previousId)}>-</button>
          <label>
            <span>Go To No.</span>
            <input
              type="number"
              min={0}
              max={maxRecords - 1}
              value={selectedId}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next) && next >= 0 && next < maxRecords) onSelect(next);
              }}
            />
          </label>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelect(nextId)}>+</button>
          <select value={selectedId} onChange={(event) => onSelect(Number(event.currentTarget.value))}>
            {Array.from({ length: maxRecords }, (_, id) => {
              const record = records.find((candidate) => candidate.id === id);
              return <option key={id} value={id}>{id}: {record ? labelFor(record) : fallbackLabelFor(id)}</option>;
            })}
          </select>
          <button type="button" className="btn btn-primary btn-xs" disabled={selectedIsScenario} onClick={() => onCreate(selectedId)}>
            Customize In This Scenario
          </button>
          <button
            type="button"
            className="btn btn-danger btn-xs"
            disabled={!selectedIsScenario}
            onClick={() => selectedRecord && onClear(selectedId)}
          >
            Clear Scenario Custom
          </button>
        </div>
        <div className="rules-selected-summary">
          <strong>{selectedLabel}</strong>
          <span>{selectedSummary}</span>
          <b>{selectedIsScenario ? "Scenario custom" : "Built-in Realmz"}</b>
        </div>
      </section>
      <main className="rules-detail">
        {children}
      </main>
    </div>
  );
}

function entryHasScenarioVersion(record: unknown) {
  return typeof record === "object" && record !== null && "hasScenarioVersion" in record && Boolean((record as { hasScenarioVersion?: boolean }).hasScenarioVersion);
}

function RuleSection({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="rules-section">
      <header><span>{title}</span><b>{badge}</b></header>
      <div className="rules-field-grid">{children}</div>
    </section>
  );
}

function EmptyRulesState({ label, selectedLabel, onCreate }: { label: string; selectedLabel: string; onCreate: () => void }) {
  return (
    <div className="scenario-empty-state rules-empty-state">
      <p>{selectedLabel} is currently using the shared Realmz definition.</p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>Create Scenario {capitalize(label)}</button>
    </div>
  );
}

function TextField({ label, value, onCommit, wide = false, disabled = false }: { label: string; value: string; onCommit: (value: string) => void; wide?: boolean; disabled?: boolean }) {
  return (
    <label className={`scenario-field${wide ? " scenario-field-wide" : ""}`}>
      <span>{label}</span>
      <textarea
        key={value}
        defaultValue={value}
        disabled={disabled}
        rows={wide ? 3 : 1}
        onBlur={(event) => {
          if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
        }}
      />
    </label>
  );
}

function NumberField({ label, value, onCommit, disabled = false, compact = false, hint }: { label: string; value: number; onCommit?: (value: number) => void; disabled?: boolean; compact?: boolean; hint?: string }) {
  return (
    <label className={`scenario-field${compact ? " rules-field-compact" : ""}`}>
      <span>{label}</span>
      <input
        key={value}
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (!disabled && Number.isFinite(next) && next !== value) onCommit?.(next);
        }}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SelectField({ label, value, options, onCommit, disabled = false }: { label: string; value: number; options: string[]; onCommit: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="scenario-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        {options.map((option, index) => <option key={option} value={index}>{index} - {option}</option>)}
      </select>
    </label>
  );
}

function CheckboxField({ label, checked, onCommit, disabled = false }: { label: string; checked: boolean; onCommit: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="rules-checkbox-field">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onCommit(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

function IconNumberField({
  label,
  value,
  assets,
  onCommit,
  disabled = false,
  iconId,
  hint
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  onCommit: (value: number) => void;
  disabled?: boolean;
  iconId?: ((value: number) => number) | null;
  hint?: (value: number) => string;
}) {
  const resolvedIconId = iconId === null ? null : iconId ? iconId(value) : value;
  const asset = resolvedIconId === null ? null : findRuleAsset(assets, "icon", resolvedIconId);
  const preview = useRuleIconPreview(asset);
  return (
    <label className="scenario-field rules-icon-number">
      <span>{label}</span>
      <div>
        {preview ? <img src={preview} alt={`${label} ${resolvedIconId}`} /> : <b>{value || "-"}</b>}
        <input
          key={value}
          type="number"
          defaultValue={value}
          disabled={disabled}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!disabled && Number.isFinite(next) && next !== value) onCommit(next);
          }}
        />
      </div>
      <small>{hint ? hint(value) : resolvedIconId !== null ? `cicn ${resolvedIconId}` : "Combat tile preview pending"}</small>
    </label>
  );
}

function SoundNumberField({ label, value, assets, onCommit, disabled = false }: { label: string; value: number; assets: LibraryAsset[]; onCommit: (value: number) => void; disabled?: boolean }) {
  const soundId = 600 + value;
  const asset = value > 0 ? findRuleAsset(assets, "sound", soundId) : null;
  const [status, setStatus] = useState<string | null>(null);
  const play = async () => {
    if (!asset) {
      setStatus(value > 0 ? `snd ${soundId} unavailable` : "No sound");
      return;
    }
    const url = await loadBrowserBundledLibraryAssetPreview(asset);
    if (!url) {
      setStatus(`snd ${soundId} unavailable`);
      return;
    }
    const audio = new Audio(url);
    audio.play().then(() => setStatus(`Playing snd ${soundId}`)).catch(() => setStatus(`Could not play snd ${soundId}`));
  };
  return (
    <label className="scenario-field rules-sound-number">
      <span>{label}</span>
      <div>
        <input
          key={value}
          type="number"
          defaultValue={value}
          disabled={disabled}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!disabled && Number.isFinite(next) && next !== value) onCommit(next);
          }}
        />
        <button type="button" className="btn btn-secondary btn-xs" onClick={play} disabled={!asset}>Play</button>
      </div>
      <small>{status ?? (value > 0 ? `snd ${soundId}` : "No sound")}</small>
    </label>
  );
}

function spellAnimationIconId(value: number) {
  return 11992 + value * 8;
}

function findRuleAsset(assets: LibraryAsset[], kind: "icon" | "sound", resourceId: number) {
  return assets.find((candidate) => {
    if (candidate.resourceId !== resourceId) return false;
    const type = candidate.type.toLowerCase();
    const resourceType = candidate.resourceType?.trim().toLowerCase() ?? "";
    if (kind === "icon") return type === "icon" || type.includes("icon") || resourceType === "cicn";
    return type === "sound" || resourceType === "snd";
  }) ?? null;
}

function useRuleIconPreview(asset: LibraryAsset | null) {
  const [preview, setPreview] = useState<string | null>(asset?.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!asset) {
      setPreview(null);
      return;
    }
    setPreview(asset.previewPath ?? null);
    loadBrowserBundledLibraryAssetPreview(asset).then((url) => {
      if (!disposed) setPreview(url ?? asset.previewPath ?? null);
    }).catch(() => {
      if (!disposed) setPreview(asset.previewPath ?? null);
    });
    return () => {
      disposed = true;
    };
  }, [asset]);
  return preview;
}

function PairGrid({ labels, values, leftLabel, rightLabel, onChange }: { labels: string[]; values: number[]; leftLabel: string; rightLabel: string; onChange: (values: number[]) => void }) {
  return (
    <div className="rules-pair-grid">
      <b></b><b>{leftLabel}</b><b>{rightLabel}</b>
      {labels.map((label, index) => (
        <RowPair key={label} label={label} left={values[index * 2] ?? 0} right={values[index * 2 + 1] ?? 0} onChange={(left, right) => {
          const next = [...values];
          next[index * 2] = left;
          next[index * 2 + 1] = right;
          onChange(next);
        }} />
      ))}
    </div>
  );
}

function RowPair({ label, left, right, onChange }: { label: string; left: number; right: number; onChange: (left: number, right: number) => void }) {
  return (
    <>
      <span>{label}</span>
      <input type="number" defaultValue={left} onBlur={(event) => onChange(Number(event.currentTarget.value), right)} />
      <input type="number" defaultValue={right} onBlur={(event) => onChange(left, Number(event.currentTarget.value))} />
    </>
  );
}

function ArrayFields({ title, labels, values, onChange, compact = false }: { title: string; labels: string[]; values: number[]; onChange: (values: number[]) => void; compact?: boolean }) {
  return (
    <div className={compact ? "rules-array compact" : "rules-array"}>
      <strong>{title}</strong>
      {labels.map((label, index) => (
        <label key={`${title}:${label}`}>
          <span>{label}</span>
          <input type="number" defaultValue={values[index] ?? 0} onBlur={(event) => {
            const next = [...values];
            next[index] = Number(event.currentTarget.value);
            onChange(next);
          }} />
        </label>
      ))}
    </div>
  );
}

function CheckboxMatrix({ labels, values, onChange }: { labels: string[]; values: number[]; onChange: (values: number[]) => void }) {
  return (
    <div className="rules-checkbox-grid">
      {Array.from({ length: 30 }, (_, index) => {
        const label = labels[index] ?? `Unused ${index + 1}`;
        const checked = (values[index] ?? 0) !== 0;
        return (
          <label key={index} className={index >= labels.length ? "is-unused" : ""}>
            <input type="checkbox" checked={checked} disabled={index >= labels.length} onChange={(event) => {
              const next = [...values];
              next[index] = event.currentTarget.checked ? 1 : 0;
              onChange(next);
            }} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function BitsetEditor({ labels, values, onChange }: { labels: string[]; values: number[]; onChange: (values: number[]) => void }) {
  return (
    <div className="rules-checkbox-grid">
      {labels.map((label, index) => {
        const word = Math.floor(index / 32);
        const bit = index % 32;
        const checked = Boolean((values[word] ?? 0) & (1 << bit));
        return (
          <label key={label}>
            <input type="checkbox" checked={checked} onChange={(event) => {
              const next = [...values];
              const current = next[word] ?? 0;
              next[word] = event.currentTarget.checked ? current | (1 << bit) : current & ~(1 << bit);
              onChange(next);
            }} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function MatrixFields({ rows, columns, values, onChange }: { rows: string[]; columns: string[]; values: number[][]; onChange: (values: number[][]) => void }) {
  return (
    <div className="rules-matrix" style={{ gridTemplateColumns: `minmax(90px, 1fr) repeat(${columns.length}, minmax(70px, 1fr))` }}>
      <b></b>
      {columns.map((column) => <b key={column}>{column}</b>)}
      {rows.map((row, rowIndex) => (
        <MatrixRow key={row} row={row} rowIndex={rowIndex} columns={columns} values={values} onChange={onChange} />
      ))}
    </div>
  );
}

function MatrixRow({ row, rowIndex, columns, values, onChange }: { row: string; rowIndex: number; columns: string[]; values: number[][]; onChange: (values: number[][]) => void }) {
  return (
    <>
      <span>{row}</span>
      {columns.map((column, columnIndex) => (
        <input key={`${row}:${column}`} type="number" defaultValue={values[rowIndex]?.[columnIndex] ?? 0} onBlur={(event) => {
          const next = values.map((rowValues) => [...rowValues]);
          while (next.length <= rowIndex) next.push([]);
          next[rowIndex][columnIndex] = Number(event.currentTarget.value);
          onChange(next);
        }} />
      ))}
    </>
  );
}

function AgeBands({ record, onChange }: { record: ScenarioRaceOverride; onChange: (ageRange: number[][], ageChange: number[][]) => void }) {
  const labels = ["Youth", "Young", "Prime", "Adult", "Senior"];
  return (
    <div className="rules-age-grid">
      {labels.map((label, band) => (
        <section key={label}>
          <strong>{label}</strong>
          <RowPair label="Age" left={record.ageRange[band]?.[0] ?? 0} right={record.ageRange[band]?.[1] ?? 0} onChange={(left, right) => {
            const ageRange = record.ageRange.map((range) => [...range]);
            ageRange[band] = [left, right];
            onChange(ageRange, record.ageChange);
          }} />
          {RACE_ATTRIBUTES.map((attribute, index) => (
            <label key={attribute}>
              <span>{attribute}</span>
              <input type="number" defaultValue={record.ageChange[band]?.[index] ?? 0} onBlur={(event) => {
                const ageChange = record.ageChange.map((range) => [...range]);
                while (ageChange.length <= band) ageChange.push([]);
                ageChange[band][index] = Number(event.currentTarget.value);
                onChange(record.ageRange, ageChange);
              }} />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}

function selectedIdFor(entityId: string | undefined, prefix: string) {
  if (!entityId?.startsWith(`${prefix}:`)) return null;
  const value = Number(entityId.slice(prefix.length + 1));
  return Number.isInteger(value) ? value : null;
}

function normalizeFamily(activeEditor: string): RulesFamily {
  if (activeEditor === "races") return "races";
  if (activeEditor === "castes") return "castes";
  return "spells";
}

function familyLabel(family: RulesFamily) {
  if (family === "spells") return "Spell Editor";
  if (family === "races") return "Race Editor";
  return "Caste Editor";
}

function victoryPointLabels() {
  return Array.from({ length: 30 }, (_, index) => index === 29 ? "++" : `Level ${index + 2}`);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function overrideCount(project: Project, family: RulesFamily) {
  if (family === "spells") return project.spellOverrides?.length ?? 0;
  if (family === "races") return project.raceOverrides?.length ?? 0;
  return project.casteOverrides?.length ?? 0;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numArray(value: unknown, length: number, fallback = 0) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => num(source[index]) || fallback);
}

function numMatrix(value: unknown, rows: number, columns: number) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: rows }, (_, row) => {
    const rowValue = source[row];
    const cells = Array.isArray(rowValue) ? rowValue : [];
    return Array.from({ length: columns }, (_, column) => num(cells[column]));
  });
}
