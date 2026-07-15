import { ITEM_CATEGORY_LABELS } from "../../rulesCatalog";
import { ReferenceField, type ReferencePickerOption } from "../../ui";
import "./ItemClassificationFields.css";

const NO_ITEM_CATEGORY_VALUE = -1;
const MULTIPLE_ITEM_CATEGORIES_VALUE = -2;

export function itemCategoryReferenceOptions(): ReferencePickerOption<number>[] {
  return [
    {
      key: "item-category:none",
      value: NO_ITEM_CATEGORY_VALUE,
      label: "No category",
      detail: "No item-category flag is set.",
      searchText: "none no category unrestricted"
    },
    ...ITEM_CATEGORY_LABELS.map((label, index) => ({
      key: `item-category:${index}`,
      value: index,
      label: `${index}: ${label}`,
      detail: "Realmz item category",
      searchText: `${index} ${label} item category`
    }))
  ];
}

export function selectedItemCategoryIndexes(itemCat0: number, itemCat1: number) {
  return ITEM_CATEGORY_LABELS.flatMap((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index) ? [index] : []);
}

export function itemCategoryPairForSingleSelection(index: number | null): [number, number] {
  if (index == null || !Number.isFinite(index) || index < 0 || index >= ITEM_CATEGORY_LABELS.length) return [0, 0];
  return setItemCategoryBitInPair(0, 0, Math.trunc(index), true);
}

export function itemCategoryBitFromPair(itemCat0: number, itemCat1: number, index: number) {
  const source = index < 32 ? itemCat0 : itemCat1;
  return Boolean((source >>> 0) & (1 << itemCategoryStorageBit(index)));
}

export function ItemCategoryReferenceField({
  itemCat0,
  itemCat1,
  onChange
}: {
  itemCat0: number;
  itemCat1: number;
  onChange: (itemCat0: number, itemCat1: number) => void;
}) {
  const options = itemCategoryReferenceOptions();
  const selectedIndexes = selectedItemCategoryIndexes(itemCat0, itemCat1);
  const selectedIndex = selectedIndexes.length === 1 ? selectedIndexes[0] : null;
  const value = selectedIndex ?? (selectedIndexes.length ? MULTIPLE_ITEM_CATEGORIES_VALUE : NO_ITEM_CATEGORY_VALUE);
  const selected = selectedIndex == null
    ? options.find((option) => option.value === value) ?? null
    : options.find((option) => option.value === selectedIndex) ?? null;
  const selectedLabels = selectedIndexes.map((index) => ITEM_CATEGORY_LABELS[index]);
  const current = selectedIndexes.length === 0 ? {
    label: "No category",
    detail: "No item-category flag is set.",
    state: "empty" as const
  } : selectedIndexes.length === 1 && selected ? {
    label: selected.label,
    detail: selected.detail,
    state: "resolved" as const
  } : {
    label: `${selectedIndexes.length} categories`,
    detail: `${selectedLabels.join(", ")}. Selecting one category replaces the current category flags.`,
    state: "unresolved" as const
  };

  return (
    <div className="item-classification-reference-field item-category-reference-field">
      <span>Category</span>
      <ReferenceField
        ariaLabel="Search item category"
        placeholder="Search category # or name..."
        options={options}
        value={value}
        selectedValue={selected?.value ?? null}
        current={current}
        resultNoun="category"
        resultNounPlural="categories"
        emptyTitle="No matching item categories"
        emptyBody="Try a category number or a weapon, armor, accessory, or item-family name."
        initialVisibleCount={60}
        compact
        compactPanelTitle="Item Category Picker"
        compactStorageKey="economy.item.category.picker.position"
        onChange={(nextIndex) => onChange(...itemCategoryPairForSingleSelection(
          nextIndex === NO_ITEM_CATEGORY_VALUE ? null : nextIndex
        ))}
      />
    </div>
  );
}

export const ITEM_TYPE_LABELS: Record<number, string> = {
  0: "Ring",
  1: "Do not use",
  2: "Melee Weapon",
  3: "Shield",
  4: "Armor and Robe",
  5: "Gauntlet and Gloves",
  6: "Cloak and Cape",
  7: "Helmet and Cap",
  8: "Ion Stone",
  9: "Boots",
  10: "Quiver",
  11: "Waist and Belt",
  12: "Neck",
  13: "Scroll Case",
  14: "Misc Item",
  15: "Missile Weapon",
  16: "Broach",
  17: "Face and Mask",
  18: "Scabbard",
  19: "Belt Loop",
  20: "Scroll",
  21: "Magic Item",
  22: "Supply Item",
  23: "Action Point Item (SP5 = AP ID)",
  24: "Identified Item",
  25: "Scenario Item"
};

export function itemTypeLabel(value: number) {
  return ITEM_TYPE_LABELS[Math.abs(value)] ?? `Raw type ${value}`;
}

export function itemTypeText(value: number | null | undefined) {
  if (value == null) return "unknown";
  return `${value}: ${itemTypeLabel(value)}`;
}

export function itemTypeReferenceOptions(): ReferencePickerOption<number>[] {
  return Array.from({ length: 26 }, (_, value) => ({
    key: `item-type:${value}`,
    value,
    label: itemTypeText(value),
    detail: "Realmz equipment and use type",
    searchText: `${value} ${itemTypeLabel(value)} equipment use type`
  }));
}

export function ItemTypeReferenceField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const options = itemTypeReferenceOptions();
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <div className="item-number-input item-classification-reference-field item-type-reference-field" title="Realmz equipment/use type. This is separate from the item category restriction list.">
      <span>Type</span>
      <ReferenceField
        ariaLabel="Search item type"
        placeholder="Search type # or name..."
        options={options}
        value={value}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: itemTypeText(value),
          detail: `Imported value ${value} is outside the standard Realmz item-type table.`,
          state: "unresolved"
        }}
        resultNoun="item type"
        resultNounPlural="item types"
        emptyTitle="No matching item types"
        emptyBody="Try a type number or an equipment or use-type name."
        compact
        compactPanelTitle="Item Type Picker"
        compactStorageKey="economy.item.type.picker.position"
        onChange={onChange}
      />
    </div>
  );
}

function itemCategoryStorageBit(index: number) {
  return 31 - (index % 32);
}

function setItemCategoryBitInPair(itemCat0: number, itemCat1: number, index: number, checked: boolean): [number, number] {
  const bit = itemCategoryStorageBit(index);
  if (index < 32) return [toSigned32(setUnsignedBit(itemCat0, bit, checked)), itemCat1];
  return [itemCat0, toSigned32(setUnsignedBit(itemCat1, bit, checked))];
}

function setUnsignedBit(value: number, bit: number, checked: boolean) {
  return checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
}

function toSigned32(value: number) {
  return value | 0;
}
