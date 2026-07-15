import { REALMZ_CASTES, REALMZ_RACES } from "../../rulesCatalog";
import {
  numericReferenceQuery,
  ReferenceField,
  type ReferencePickerOption
} from "../../ui";
import "./ItemRestrictionReferenceField.css";

export type ItemRestrictionReferenceKind = "race" | "caste";

export function itemRestrictionReferenceOptions(
  kind: ItemRestrictionReferenceKind
): ReferencePickerOption<number>[] {
  const definition = itemRestrictionDefinition(kind);
  return [
    {
      key: `item-${kind}:any`,
      value: 0,
      label: `Any ${definition.noun}`,
      detail: `No specific ${definition.noun} restriction.`,
      searchText: `0 any all unrestricted ${definition.noun}`
    },
    ...definition.labels.map((label, index) => ({
      key: `item-${kind}:${index + 1}`,
      value: index + 1,
      label: `${index + 1}: ${label}`,
      detail: `Only ${label} characters satisfy this specific ${definition.noun} restriction.`,
      searchText: `${index + 1} ${label} specific ${definition.noun}`
    }))
  ];
}

export function itemRestrictionRawOption(
  query: string,
  kind: ItemRestrictionReferenceKind,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || !Number.isSafeInteger(value) || options.some((option) => option.value === value)) {
    return null;
  }
  const noun = itemRestrictionDefinition(kind).noun;
  return {
    key: `item-${kind}:raw:${value}`,
    value,
    label: `${capitalize(noun)} ${value}`,
    detail: `Raw imported ${noun} restriction outside the standard Realmz table.`,
    searchText: `${value} raw imported unresolved ${noun}`
  };
}

export function ItemRestrictionReferenceField({
  kind,
  value,
  onChange
}: {
  kind: ItemRestrictionReferenceKind;
  value: number;
  onChange: (value: number) => void;
}) {
  const definition = itemRestrictionDefinition(kind);
  const options = itemRestrictionReferenceOptions(kind);
  const selected = options.find((option) => option.value === value) ?? null;
  const label = `Specific ${capitalize(definition.noun)}`;

  return (
    <div className="item-restriction-reference-field">
      <span>{label}</span>
      <ReferenceField
        ariaLabel={`Search specific ${definition.noun} restriction`}
        placeholder={`Search ${definition.noun} # or name...`}
        options={options}
        value={value}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `${capitalize(definition.noun)} ${value}`,
          detail: `Imported value ${value} is outside the standard Realmz ${definition.noun} table.`,
          state: "unresolved"
        }}
        rawOptionForQuery={(query) => itemRestrictionRawOption(query, kind, options)}
        resultNoun={definition.noun}
        resultNounPlural={`${definition.noun}s`}
        emptyTitle={`No matching ${definition.noun}s`}
        emptyBody={`Try a ${definition.noun} name, one-based item restriction value, or another numeric value.`}
        clearLabel={`Allow any ${definition.noun}`}
        compact
        compactPanelTitle={`${label} Picker`}
        compactStorageKey={`economy.item.specific-${kind}.picker.position`}
        onChange={onChange}
      />
    </div>
  );
}

function itemRestrictionDefinition(kind: ItemRestrictionReferenceKind) {
  return kind === "race"
    ? { noun: "race", labels: REALMZ_RACES }
    : { noun: "caste", labels: REALMZ_CASTES };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
