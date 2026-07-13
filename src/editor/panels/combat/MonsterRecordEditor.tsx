import { ReactNode, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { itemReferenceOptions } from "../../itemReferences";
import type { PreviewRuntimeContext } from "../../previewUrls";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../../rulesCatalog";
import type { IconEntry, LibraryCatalog, MonsterRecord, Project } from "../../types";
import type { CombatLookups } from "./combatLookups";
import { FieldLabel, NumberField, TextAreaField, TextField, ToggleButton } from "./CombatFields";
import { monsterIconPickerOptions, monsterIconSourceStatusLabel } from "./iconSetModel";
import { MonsterIcon, resolveMonsterIcon } from "./MonsterIconPreview";
import { ReferenceIconPreview } from "./ReferenceIconPreview";
import { IconPairPreview } from "./IconPairResources";
import { MONSTER_MONEY_HELP, MONSTER_MONEY_LABELS, MONSTER_MONEY_REWARDS } from "./monsterMoneyModel";
import { combatSpellOptions } from "./monsterReferenceOptions";
import { useCombatRenderTiming } from "./performance";

const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const MONSTER_REQUIRED_WEAPON_HELP = "Realmz checks this monster record byte before allowing weapon hits: All is 0, Blunt only is -1, Sharp only is -2, and positive codes match the attacker's weapon number. Divinity fixture evidence shows the adjacent Req Weap value writes Data MD rel 7.";

const MONSTER_SUMMON_ELIGIBLE_HELP = "Divinity labels this as Can Be Summoned. Realmz random-summon paths require 1, ordinary monsters are 0, and -1 is the NPC/ally marker.";
const MONSTER_SUMMON_ELIGIBLE_OPTIONS: CombatSelectOption[] = [
  { key: "summon-eligible:yes", value: 1, label: "1 = Yes", detail: "Runtime-proven: random summon selection requires cansum == 1." },
  { key: "summon-eligible:npc", value: -1, label: "-1 = Is a NPC", detail: "Runtime-proven: Realmz uses -1 for special NPC/ally handling." }
];
const MONSTER_SAVE_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Save`);
const MONSTER_IMMUNITY_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Immune`);
const MONSTER_ATTACK_FORM_OPTIONS: CombatSelectOption[] = [
  { key: "attack-form:32", value: 32, label: "Pummel" },
  { key: "attack-form:33", value: 33, label: "Claw" },
  { key: "attack-form:34", value: 34, label: "Bite" },
  { key: "attack-form:35", value: 35, label: "Not Used" },
  { key: "attack-form:36", value: 36, label: "Not Used" },
  { key: "attack-form:37", value: 37, label: "Not Used" },
  { key: "attack-form:38", value: 38, label: "Punch / Kick" },
  { key: "attack-form:39", value: 39, label: "Club" },
  { key: "attack-form:40", value: 40, label: "Slime" },
  { key: "attack-form:41", value: 41, label: "Sting" }
];
const MONSTER_ATTACK_SPECIAL_OPTIONS: CombatSelectOption[] = [
  { key: "attack-special:0", value: 0, label: "No Special Attacks" },
  { key: "attack-special:1", value: 1, label: "Cause Fear" },
  { key: "attack-special:2", value: 2, label: "Paralyze" },
  { key: "attack-special:3", value: 3, label: "Curse" },
  { key: "attack-special:4", value: 4, label: "Stupify" },
  { key: "attack-special:5", value: 5, label: "Entangle" },
  { key: "attack-special:6", value: 6, label: "Poison" },
  { key: "attack-special:7", value: 7, label: "Confuse" },
  { key: "attack-special:8", value: 8, label: "Drain Spell Points" },
  { key: "attack-special:9", value: 9, label: "Drain Experience" },
  { key: "attack-special:10", value: 10, label: "Charm" },
  { key: "attack-special:11", value: 11, label: "Fire Damage" },
  { key: "attack-special:12", value: 12, label: "Cold Damage" },
  { key: "attack-special:13", value: 13, label: "Electric Damage" },
  { key: "attack-special:14", value: 14, label: "Chemical Damage" },
  { key: "attack-special:15", value: 15, label: "Mental Damage" },
  { key: "attack-special:16", value: 16, label: "Cause Disease" },
  { key: "attack-special:17", value: 17, label: "Cause Age" },
  { key: "attack-special:18", value: 18, label: "Cause Blindness" },
  { key: "attack-special:19", value: 19, label: "Turn to Stone" }
];

const RANDOM_WEAPON_OPTIONS: CombatSelectOption[] = [
  { key: "random-weapon:-1", value: -1, label: "-1 Random swords" },
  { key: "random-weapon:-2", value: -2, label: "-2 Random clubs" },
  { key: "random-weapon:-3", value: -3, label: "-3 Random clubs / spears" },
  { key: "random-weapon:-4", value: -4, label: "-4 Random axes" },
  { key: "random-weapon:-5", value: -5, label: "-5 Random small swords / small axes" },
  { key: "random-weapon:-6", value: -6, label: "-6 Random clubs / flails / spears" },
  { key: "random-weapon:-7", value: -7, label: "-7 Random spears / pole weapons" },
  { key: "random-weapon:-8", value: -8, label: "-8 Random axes / spears" },
  { key: "random-weapon:-9", value: -9, label: "-9 Random swords / dagger / cutlass / nunchucka" }
];
const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;



export function MonsterRecordEditor({
  project,
  catalog,
  monster,
  iconEntries,
  lookups,
  previewContext,
  description,
  headerMeta,
  onUpdate,
  onUpdateDescription,
  onCopyToLibrary,
  onReplaceScenario,
  onOpenIconSet,
  onDuplicate,
  onClear,
  duplicateLabel = "Duplicate",
  replaceLabel = "Replace Scenario",
  clearLabel = "Clear To Defaults"
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  description: string;
  headerMeta?: ReactNode;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
  onUpdateDescription: (text: string) => void;
  onCopyToLibrary?: () => void;
  onReplaceScenario?: () => void;
  onOpenIconSet?: () => void;
  onDuplicate: () => void;
  onClear?: () => void;
  duplicateLabel?: string;
  replaceLabel?: string;
  clearLabel?: string;
}) {
  useCombatRenderTiming("MonsterEditor");
  const [detailsMonsterId, setDetailsMonsterId] = useState<number | null>(null);
  const detailsReady = detailsMonsterId === monster.id;
  useEffect(() => {
    setDetailsMonsterId(null);
    const timer = window.setTimeout(() => setDetailsMonsterId(monster.id), 450);
    return () => window.clearTimeout(timer);
  }, [monster.id]);
  return (
    <article className="combat-editor monster-editor scenario-monster-editor">
      <header className="combat-editor-header monster-editor-title-header monster-record-editor-header">
        <div className="combat-editor-actions monster-editor-record-actions">
          {onCopyToLibrary ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToLibrary}>Copy To Library</button> : null}
          {onReplaceScenario ? <button type="button" className="btn btn-danger btn-xs" title="Explicitly replace the selected Normal scenario monster slot" onClick={onReplaceScenario}>{replaceLabel}</button> : null}
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>{duplicateLabel}</button>
          {onClear ? <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>{clearLabel}</button> : null}
        </div>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
      </header>
      <div className="monster-editor-section-grid monster-editor-identity-description-grid">
        <section className="monster-section monster-identity-section">
          <MonsterIconControl
            monster={monster}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            onCommit={(iconId) => onUpdate({ iconId })}
            onOpenIconSet={onOpenIconSet}
          />
          <div className="monster-field-grid">
            <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
            <MacroReferenceField project={project} value={monster.deathMacro} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
          </div>
        </section>
        <section className="monster-section monster-description-section">
          <SectionHeader title="Monster Description" help="Data DES bestiary/scrapbook text." />
          <TextAreaField label="Description" value={description} placeholder="No monster description." onCommit={onUpdateDescription} />
        </section>
      </div>
      <div className="monster-editor-section-grid monster-editor-primary-grid">
        <MonsterNumberSection
          title="Combat Stats"
          className="monster-compact-number-section"
          monster={monster}
          fields={[
            ["Stamina Level", "hitDice"],
            ["Bonus Stamina", "staminaBonus"],
            ["Agility", "agility"],
            ["Move Max", "movementMax"],
            ["Armor Rating", "armor"],
            ["Magic Resist %", "magicResistance"],
            ["Magic + Required To Hit", "magicToHit"],
            ["Victory Points", "exp"],
            ["Spell Points", "spellPoints"],
            ["Max Spell Points", "maxSpellPoints"]
          ]}
          onUpdate={onUpdate}
        />
        <MonsterBehaviorSection
          project={project}
          catalog={catalog}
          monster={monster}
          onUpdate={onUpdate}
        />
      </div>
      {detailsReady ? (
        <>
          <div className="monster-editor-section-grid monster-editor-reference-grid">
            <div className="monster-attacks-traits-column">
              <section className="monster-section monster-attacks-section">
                <SectionHeader title="Attacks" />
                <div className="monster-attack-equipment-row">
                  <WeaponIdField project={project} catalog={catalog} value={monster.weapon} onCommit={(weapon) => onUpdate({ weapon })} />
                </div>
                <div className="monster-attacks-grid">
                  {Array.from({ length: 5 }, (_, row) => {
                    const values = monster.attacks[row] ?? [0, 0, 0, 0];
                    const updateAttackSlot = (slot: number, value: number) => {
                      const attacks = [...monster.attacks];
                      while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                      attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                      onUpdate({ attacks });
                    };
                    return (
                      <div key={row} className="monster-attack-row">
                        <strong>Attack {row + 1}</strong>
                        <NumberField label="Damage Low" value={values[0] ?? 0} onCommit={(value) => updateAttackSlot(0, value)} />
                        <NumberField label="Damage High" value={values[1] ?? 0} onCommit={(value) => updateAttackSlot(1, value)} />
                        <MonsterAttackCodePicker label="Form" value={values[2] ?? 0} options={MONSTER_ATTACK_FORM_OPTIONS} onCommit={(value) => updateAttackSlot(2, value)} />
                        <MonsterAttackCodePicker label="Special" value={values[3] ?? 0} options={MONSTER_ATTACK_SPECIAL_OPTIONS} onCommit={(value) => updateAttackSlot(3, value)} />
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="monster-section monster-traits-section">
                <SectionHeader title="Traits" />
                <div className="monster-trait-grid combat-traits">
                  {["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"].map((label, index) => (
                    <label key={label} className="combat-check-field">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(monster.typeFlags[index])}
                        onChange={(event) => onUpdate({ typeFlags: updateArraySlot(monster.typeFlags, index, event.currentTarget.checked ? 1 : 0, 8) })}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
            <section className="monster-section monster-spells-loot-section">
              <SectionHeader title="Spells / Loot" help="Spell slots, gold/gems/jewelry caps, and item drops." />
              <div className="monster-spells-loot-layout">
                <div className="monster-spells-column">
                  <SpellSlotGrid project={project} catalog={catalog} values={monster.spells} onCommit={(spells) => onUpdate({ spells })} />
                </div>
                <div className="monster-loot-column">
                  <ItemSlotGrid project={project} catalog={catalog} values={monster.items} onCommit={(items) => onUpdate({ items })} />
                  <MonsterMoneyFields
                    values={monster.money}
                    iconEntries={iconEntries}
                    catalog={catalog}
                    lookups={lookups}
                    previewContext={previewContext}
                    onCommit={(money) => onUpdate({ money })}
                  />
                </div>
              </div>
            </section>
          </div>
          <section className="monster-section monster-advanced-section">
            <SectionHeader title="Saves, Immunities, And Conditions" />
            <div className="monster-advanced-group monster-advanced-immunities">
              <CompactCheckboxFields labels={MONSTER_IMMUNITY_LABELS} values={monster.spellImmunities} onCommit={(spellImmunities) => onUpdate({ spellImmunities })} />
            </div>
            <div className="monster-advanced-group monster-advanced-saves">
              <CompactArrayFields labels={MONSTER_SAVE_LABELS} values={monster.saves} onCommit={(saves) => onUpdate({ saves })} />
            </div>
            <div className="monster-advanced-group monster-advanced-conditions">
              <CompactArrayFields labels={CONDITION_LABELS} values={monster.conditions} onCommit={(conditions) => onUpdate({ conditions })} />
            </div>
          </section>
        </>
      ) : <div className="monster-editor-details-placeholder" aria-hidden="true" />}
    </article>
  );
}



function MonsterIconControl({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  onCommit,
  onOpenIconSet
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (iconId: number) => void;
  onOpenIconSet?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const statusLabel = monsterIconSourceStatusLabel(resolution.sourceStatus);
  const canPickTargetIcon = Boolean(onOpenIconSet);
  const iconTitle = `${canPickTargetIcon ? "Choose monster icon" : "Monster icon"} (${statusLabel}: ${resolution.label})`;
  const showSourceBadge = resolution.sourceStatus !== "default-art";
  const preview = <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />;
  return (
    <div className="monster-icon-control">
      {canPickTargetIcon ? (
        <button
          type="button"
          className="monster-icon-button"
          onClick={() => setPickerOpen(true)}
          title={iconTitle}
          aria-label="Choose monster icon"
        >
          {preview}
        </button>
      ) : <span title={iconTitle}>{preview}</span>}
      {showSourceBadge ? (
        <span className={`monster-icon-source-badge ${resolution.sourceStatus}`} title={resolution.label}>
          {statusLabel}
        </span>
      ) : null}
      {canPickTargetIcon ? (
        <MonsterIconPickerModal
          open={pickerOpen}
          currentIconId={Math.abs(monster.iconId)}
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelect={(iconId) => onCommit(iconId)}
          onOpenIconSet={onOpenIconSet}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MonsterIconPickerModal({
  open,
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  open: boolean;
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <MonsterIconPickerDialog
      currentIconId={currentIconId}
      project={project}
      iconEntries={iconEntries}
      lookups={lookups}
      previewContext={previewContext}
      query={query}
      onQuery={setQuery}
      onSelect={onSelect}
      onOpenIconSet={onOpenIconSet}
      onClose={onClose}
    />
  );
}

function MonsterIconPickerDialog({
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  query,
  onQuery,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => monsterIconPickerOptions(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [
        String(option.baseId),
        `icon ${option.baseId}`,
        option.sourceLabel,
        monsterIconSourceStatusLabel(option.sourceStatus)
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);
  return (
    <div className="monster-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="monster-icon-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-icon-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="monster-icon-picker-header">
          <div>
            <h3 id="monster-icon-picker-title">Choose Monster Icon</h3>
          </div>
          <div className="monster-icon-picker-actions">
            {onOpenIconSet ? (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  onClose();
                  onOpenIconSet();
                }}
              >
                Open Icon Set
              </button>
            ) : null}
            <button type="button" className="btn btn-icon btn-xs" aria-label="Close icon picker" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <input
          className="monster-icon-picker-search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          placeholder="Search icon ID or source..."
          autoFocus
        />
        <div className="monster-icon-picker-grid" role="listbox" aria-label="Scenario monster icon targets">
          {filteredOptions.map((option) => {
            const selected = option.baseId === currentIconId;
            return (
              <button
                key={option.key}
                type="button"
                className={`monster-icon-picker-option${selected ? " selected" : ""}`}
                aria-selected={selected}
                role="option"
                onClick={() => {
                  onSelect(option.baseId);
                  onClose();
                }}
              >
                <IconPairPreview baseAsset={option.asset} pairedAsset={option.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>Icon {option.baseId}</strong>
                  <small>{monsterIconSourceStatusLabel(option.sourceStatus)}</small>
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 ? <p className="empty-copy compact">No scenario target icons match that search.</p> : null}
        </div>
      </section>
    </div>
  );
}

function MonsterNumberSection({
  title,
  className = "",
  monster,
  fields,
  onUpdate
}: {
  title: string;
  className?: string;
  monster: MonsterRecord;
  fields: Array<[string, keyof MonsterRecord]>;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  return (
    <section className={`monster-section${className ? ` ${className}` : ""}`}>
      <SectionHeader title={title} />
      <div className="monster-field-grid">
        {fields.map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
      </div>
    </section>
  );
}

function MonsterBehaviorSection({
  project,
  catalog,
  monster,
  onUpdate
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  const fields: Array<[string, keyof MonsterRecord]> = [
    ["Side", "traitor"],
    ["Size", "size"],
    ["Attacks", "attackCount"],
    ["Magical Attacks", "magicAttackCount"],
    ["Damage Plus", "damageBonus"],
    ["Cast Spell %", "castPercent"],
    ["Run Away %", "runPercent"],
    ["Surrender %", "surrenderPercent"],
    ["Use Missile %", "missilePercent"]
  ];
  return (
    <section className="monster-section monster-compact-number-section">
      <SectionHeader title="Behavior" />
      <div className="monster-field-grid">
        <NumberField label="Side" value={Number(monster.traitor ?? 0)} onCommit={(traitor) => onUpdate({ traitor })} />
        <NumberField label="Size" value={Number(monster.size ?? 0)} onCommit={(size) => onUpdate({ size })} />
        <RequiredWeaponField project={project} catalog={catalog} value={monster.distance} onCommit={(distance) => onUpdate({ distance })} />
        {fields.slice(2).map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
        <SummonEligibleField value={monster.canSummon} onCommit={(canSummon) => onUpdate({ canSummon })} />
      </div>
    </section>
  );
}

function SectionHeader({ title, help }: { title: string; help?: string }) {
  return (
    <header>
      <strong>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : title}
      </strong>
    </header>
  );
}

type CombatSelectOption = { key: string; value: number; label: string; detail?: string };

function MacroReferenceField({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(
    () => (project.triggers ?? [])
      .filter((trigger) => trigger.source === "Data ED3")
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.filter((action) => action.rawCode !== 0).length} action step(s)`
      })),
    [project.triggers]
  );
  return <NumberSelectField label="Monster Macro" help={MONSTER_DEATH_ACTION_HELP} value={value} options={options} emptyLabel="No monster macro" onCommit={onCommit} />;
}

function WeaponIdField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(() => [
    ...RANDOM_WEAPON_OPTIONS,
    ...itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: item.detail
    }))
  ], [catalog, project]);
  return <NumberSelectField label="Weapon Used" value={value} options={options} emptyLabel="No weapon" onCommit={onCommit} />;
}

function RequiredWeaponField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(() => monsterRequiredWeaponOptions(project, catalog), [catalog, project]);
  return (
    <NumberSelectField
      label="Required Weapon"
      value={monsterRequiredWeaponDisplayCode(value)}
      options={options}
      emptyLabel="All weapons"
      help={MONSTER_REQUIRED_WEAPON_HELP}
      onCommit={(displayCode) => onCommit(monsterRequiredWeaponStoredCode(displayCode))}
    />
  );
}

function SummonEligibleField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <NumberSelectField
      label="Summon Eligible"
      value={Math.trunc(Number.isFinite(value) ? value : 0)}
      options={MONSTER_SUMMON_ELIGIBLE_OPTIONS}
      emptyLabel="0 = No"
      help={MONSTER_SUMMON_ELIGIBLE_HELP}
      onCommit={onCommit}
    />
  );
}

function monsterRequiredWeaponOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const weaponOptions = new Map(
    itemReferenceOptions(project, catalog)
      .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
      .map((item) => [item.value, item])
  );
  return [
    { key: "required-weapon:blunt", value: -1, label: "Blunt only", detail: "Stored as -1." },
    { key: "required-weapon:sharp", value: -2, label: "Sharp only", detail: "Stored as -2." },
    ...Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = weaponOptions.get(code);
      return {
        key: `required-weapon:${code}`,
        value: code,
        label: item?.label ?? `Weapon ${code}`,
        detail: item ? [item.detail, item.sourceState].filter(Boolean).join(" | ") : `Specific weapon code ${code}.`
      };
    })
  ];
}

export function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

export function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
}

function SpellSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(() => combatSpellOptions(project, catalog), [catalog, project]);
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 10 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Spell ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No spell"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 10))}
        />
      ))}
    </div>
  );
}

function ItemSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => itemReferenceOptions(project, catalog).map((item) => ({ key: item.key, value: item.value, label: item.label, detail: item.detail })),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 6 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Item ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No item"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 6))}
        />
      ))}
    </div>
  );
}

function NumberSelectField({
  label,
  value,
  options,
  emptyLabel,
  help,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  emptyLabel: string;
  help?: string;
  onCommit: (value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedOption = value !== 0 ? options.find((option) => option.value === value) ?? null : null;
  const hasCurrentValue = value !== 0 && !selectedOption;
  const renderedOptions = expanded ? options : selectedOption ? [selectedOption] : [];
  return (
    <label className="combat-field combat-select-field">
      <FieldLabel label={label} help={help} />
      <select
        value={String(value)}
        onFocus={() => setExpanded(true)}
        onMouseDown={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          onCommit(Number(event.currentTarget.value));
          setExpanded(false);
        }}
      >
        <option value="0">{emptyLabel}</option>
        {hasCurrentValue && <option value={String(value)}>Current value {value}</option>}
        {renderedOptions.map((option, index) => (
          <option key={`${option.key}:${option.value}:${index}`} value={String(option.value)} title={option.detail}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MonsterAttackCodePicker({
  label,
  value,
  options,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  onCommit: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const menuOptions = selected ? options : [{ key: `${label}:current:${value}`, value, label: `Current value ${value}` }, ...options];
  const title = selected ? `${selected.value} ${selected.label}` : `Current value ${value}`;
  return (
    <div
      className="combat-field monster-attack-code-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <FieldLabel label={label} />
      <button
        type="button"
        className="monster-attack-code-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {value}
      </button>
      {open ? (
        <div className="monster-attack-code-menu" role="listbox" aria-label={label}>
          {menuOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCommit(option.value);
                setOpen(false);
              }}
            >
              <span>{option.value}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactArrayFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array">
      {labels.map((label, index) => (
        <NumberField
          key={`${label}:${index}`}
          label={label}
          value={values[index] ?? 0}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, labels.length))}
        />
      ))}
    </div>
  );
}

function CompactCheckboxFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array monster-compact-checkbox-grid">
      {labels.map((label, index) => (
        <label key={`${label}:${index}`} className="combat-check-field monster-compact-check-field">
          <span title={label}>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(values[index])}
            onChange={(event) => onCommit(updateArraySlot(values, index, event.currentTarget.checked ? 1 : 0, labels.length))}
          />
        </label>
      ))}
    </div>
  );
}

function MonsterMoneyFields({
  values,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  values: number[];
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (values: number[]) => void;
}) {
  return (
    <div className="combat-compact-array monster-money-fields">
      <strong className="monster-money-title">Treasure</strong>
      {MONSTER_MONEY_REWARDS.map((reward, index) => (
        <MonsterMoneyField
          key={reward.label}
          reward={reward}
          value={values[index] ?? 0}
          iconEntries={iconEntries}
          catalog={catalog}
          lookups={lookups}
          previewContext={previewContext}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, MONSTER_MONEY_LABELS.length))}
        />
      ))}
    </div>
  );
}

function MonsterMoneyField({
  reward,
  value,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  reward: (typeof MONSTER_MONEY_REWARDS)[number];
  value: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="monster-money-row" title={`${reward.label}: ${MONSTER_MONEY_HELP}`}>
      <ReferenceIconPreview
        iconId={reward.iconId}
        fallbackValue={reward.iconId}
        iconEntries={iconEntries}
        catalog={catalog}
        lookups={lookups}
        previewContext={previewContext}
        preferLibraryIcon
      />
      <input
        type="number"
        aria-label={reward.label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(Number.isFinite(Number(draft)) ? Number(draft) : value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}


function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}
