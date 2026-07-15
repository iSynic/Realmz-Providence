import {
  ITEM_CATEGORY_LABELS,
  RACE_DESCRIPTOR_LABELS,
  REALMZ_CASTES,
  REALMZ_RACES
} from "../../rulesCatalog";
import type { ScenarioItemRecord } from "../../types";
import { itemCategoryBitFromPair } from "./ItemClassificationFields";
import { ItemRestrictionReferenceField } from "./ItemRestrictionReferenceField";

export type ItemRestrictionKey =
  | "raceRestrictions"
  | "casteRestrictions"
  | "specificRace"
  | "specificCaste"
  | "raceClassOnly"
  | "casteClassOnly";

const CASTE_CLASS_LABELS = [
  "Warrior Castes",
  "Thief Castes",
  "Archer Castes",
  "Sorcerer Castes",
  "Priest Castes",
  "Enchanter Castes",
  "Warrior Wizard Castes"
];

export function ItemRestrictionSummary({
  itemCat0,
  itemCat1,
  raceRestrictions,
  casteRestrictions,
  specificRace,
  specificCaste,
  raceClassOnly,
  casteClassOnly
}: {
  itemCat0: number;
  itemCat1: number;
  raceRestrictions: number;
  casteRestrictions: number;
  specificRace: number;
  specificCaste: number;
  raceClassOnly: number;
  casteClassOnly: number;
}) {
  return (
    <div className="item-restriction-summary">
      <ItemRestrictionFact label="Item Categories" value={summarizeItemCategoryLabels(itemCat0, itemCat1, 5)} />
      <ItemRestrictionFact label="Cannot Use - Race Types" value={summarizeMaskLabels(raceRestrictions, RACE_DESCRIPTOR_LABELS)} />
      <ItemRestrictionFact label="Can Use Only - Race Types" value={summarizeMaskLabels(raceClassOnly, RACE_DESCRIPTOR_LABELS)} />
      <ItemRestrictionFact label="Cannot Use - Caste Types" value={summarizeMaskLabels(casteRestrictions, CASTE_CLASS_LABELS)} />
      <ItemRestrictionFact label="Can Use Only - Caste Types" value={summarizeMaskLabels(casteClassOnly, CASTE_CLASS_LABELS)} />
      <ItemRestrictionFact label="Specific Race" value={specificRace ? `${specificRace}: ${REALMZ_RACES[specificRace - 1] ?? "Unknown race"}` : "Any"} />
      <ItemRestrictionFact label="Specific Caste" value={specificCaste ? `${specificCaste}: ${REALMZ_CASTES[specificCaste - 1] ?? "Unknown caste"}` : "Any"} />
    </div>
  );
}

export function ItemUseRestrictionEditor({
  record,
  onChange
}: {
  record: ScenarioItemRecord;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <div className="item-use-restriction-editor">
      <div className="item-specific-restrictions">
        <ItemRestrictionReferenceField
          kind="race"
          value={record.specificRace}
          onChange={(value) => onChange("specificRace", value)}
        />
        <ItemRestrictionReferenceField
          kind="caste"
          value={record.specificCaste}
          onChange={(value) => onChange("specificCaste", value)}
        />
      </div>
      <ItemMaskEditor
        title="Those That Can't Use It"
        groups={[
          { title: "Race Restrictions", field: "raceRestrictions", labels: RACE_DESCRIPTOR_LABELS, value: record.raceRestrictions },
          { title: "Caste Restrictions", field: "casteRestrictions", labels: CASTE_CLASS_LABELS, value: record.casteRestrictions }
        ]}
        onChange={onChange}
      />
      <ItemMaskEditor
        title="Those That Can Use It"
        groups={[
          { title: "Race Restrictions", field: "raceClassOnly", labels: RACE_DESCRIPTOR_LABELS, value: record.raceClassOnly },
          { title: "Caste Restrictions", field: "casteClassOnly", labels: CASTE_CLASS_LABELS, value: record.casteClassOnly }
        ]}
        onChange={onChange}
      />
    </div>
  );
}

export function itemRestrictionMaskBit(value: number, bit: number) {
  return Boolean((value >>> 0) & (1 << bit));
}

export function setItemRestrictionMaskBit(value: number, bit: number, checked: boolean) {
  const next = checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
  const unsigned = next & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function ItemMaskEditor({
  title,
  groups,
  onChange
}: {
  title: string;
  groups: Array<{ title: string; field: ItemRestrictionKey; labels: string[]; value: number }>;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <section className="item-mask-editor">
      <header>{title}</header>
      {groups.map((group) => (
        <div key={group.field}>
          <h5>{group.title}</h5>
          <div className="item-bit-editor">
            {group.labels.map((label, index) => {
              const checked = itemRestrictionMaskBit(group.value, index);
              return (
                <label key={label} className={checked ? "checked" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(
                      group.field,
                      setItemRestrictionMaskBit(group.value, index, event.currentTarget.checked)
                    )}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function ItemRestrictionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="item-fact">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function summarizeMaskLabels(mask: number, labels: string[]) {
  const selected = labels.filter((_, index) => itemRestrictionMaskBit(mask, index));
  if (!selected.length) return "None";
  if (selected.length <= 4) return selected.join(", ");
  return `${selected.slice(0, 4).join(", ")} +${selected.length - 4} more`;
}

function summarizeItemCategoryLabels(itemCat0: number, itemCat1: number, limit: number) {
  const selected = ITEM_CATEGORY_LABELS.filter((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index));
  if (!selected.length) return "None";
  if (selected.length <= limit) return selected.join(", ");
  return `${selected.slice(0, limit).join(", ")} +${selected.length - limit} more`;
}
