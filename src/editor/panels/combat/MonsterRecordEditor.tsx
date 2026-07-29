import { ReactNode, useEffect, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../../rulesCatalog";
import type { IconEntry, LibraryCatalog, MonsterRecord, Project } from "../../types";
import type { CombatLookups } from "./combatLookups";
import { NumberField, TextAreaField, TextField } from "./CombatFields";
import { ReferenceIconPreview } from "./ReferenceIconPreview";
import { MONSTER_MONEY_HELP, MONSTER_MONEY_LABELS, MONSTER_MONEY_REWARDS } from "./monsterMoneyModel";
import { useCombatRenderTiming } from "./performance";
import { MonsterIconControl } from "./MonsterIconControl";
import {
  ItemSlotGrid,
  MacroReferenceField,
  MonsterAttackCodePicker,
  RequiredWeaponField,
  SpellSlotGrid,
  SummonEligibleField,
  WeaponIdField
} from "./MonsterReferenceFields";
import {
  MONSTER_ATTACK_FORM_OPTIONS,
  MONSTER_ATTACK_SPECIAL_OPTIONS,
  updateArraySlot
} from "./monsterReferenceModel";
export { monsterRequiredWeaponDisplayCode, monsterRequiredWeaponStoredCode } from "./monsterReferenceModel";
const MONSTER_SAVE_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Save`);
const MONSTER_IMMUNITY_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Immune`);
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
  behaviorSection,
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
  behaviorSection?: ReactNode;
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
      {behaviorSection}
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
                        <MonsterAttackCodePicker label="Form" contextLabel={`Attack ${row + 1} Form`} value={values[2] ?? 0} options={MONSTER_ATTACK_FORM_OPTIONS} onCommit={(value) => updateAttackSlot(2, value)} />
                        <MonsterAttackCodePicker label="Special" contextLabel={`Attack ${row + 1} Special`} value={values[3] ?? 0} options={MONSTER_ATTACK_SPECIAL_OPTIONS} onCommit={(value) => updateAttackSlot(3, value)} />
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
