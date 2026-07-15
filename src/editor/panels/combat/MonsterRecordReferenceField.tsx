import type { ReactNode } from "react";
import {
  numericReferenceQuery,
  ReferenceField,
  type ReferencePickerOption
} from "../../ui";
import { FieldLabel } from "./CombatFields";
import type { CombatSelectOption } from "./monsterReferenceModel";

export function monsterReferencePickerOptions(
  options: CombatSelectOption[],
  searchTerms = ""
): ReferencePickerOption<number>[] {
  return options.map((option) => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: option.detail,
    searchText: [option.value, option.label, option.detail, searchTerms].filter(Boolean).join(" ")
  }));
}

export function monsterRawReferenceOption(
  query: string,
  options: ReferencePickerOption<number>[],
  noun: string
): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || value === 0 || !Number.isSafeInteger(value) || options.some((option) => option.value === value)) {
    return null;
  }
  return {
    key: `monster-reference:${noun.toLowerCase().replace(/\s+/g, "-")}:raw:${value}`,
    value,
    label: `${noun} ${value}`,
    detail: "Raw imported value not present in the decoded reference catalog",
    searchText: `${value} ${noun} raw imported unresolved`
  };
}

export function MonsterRecordReferenceField({
  label,
  value,
  options,
  emptyLabel,
  emptyDetail,
  unresolvedNoun,
  placeholder,
  resultNoun,
  panelTitle,
  storageKey,
  help,
  allowRawValue = true,
  onCommit
}: {
  label: string;
  value: number;
  options: ReferencePickerOption<number>[];
  emptyLabel: string;
  emptyDetail: string;
  unresolvedNoun: string;
  placeholder: string;
  resultNoun: string;
  panelTitle: ReactNode;
  storageKey: string;
  help?: string;
  allowRawValue?: boolean;
  onCommit: (value: number) => void;
}) {
  const normalizedValue = Math.trunc(Number.isFinite(value) ? value : 0);
  const selected = options.find((option) => option.value === normalizedValue) ?? null;
  const current = normalizedValue === 0 ? {
    label: emptyLabel,
    detail: emptyDetail,
    state: "empty" as const
  } : selected ? {
    label: selected.label,
    detail: selected.detail,
    state: "resolved" as const
  } : {
    label: `${unresolvedNoun} ${normalizedValue}`,
    detail: "This imported value is not present in the decoded reference catalog.",
    state: "unresolved" as const
  };
  return (
    <div className="combat-field monster-reference-field">
      <FieldLabel label={label} help={help} />
      <ReferenceField
        ariaLabel={`Search ${label.toLowerCase()}`}
        placeholder={placeholder}
        options={options}
        value={normalizedValue}
        selectedValue={selected?.value ?? null}
        current={current}
        rawOptionForQuery={allowRawValue
          ? (query) => monsterRawReferenceOption(query, options, unresolvedNoun)
          : undefined}
        resultNoun={resultNoun}
        resultNounPlural={`${resultNoun}s`}
        emptyTitle={`No matching ${resultNoun}s`}
        emptyBody={`Try a numeric ID or search the available ${resultNoun} details.`}
        initialVisibleCount={160}
        visibleCountStep={160}
        clearLabel={`Clear ${label.toLowerCase()}`}
        compact
        compactPanelTitle={panelTitle}
        compactStorageKey={storageKey}
        onChange={onCommit}
      />
    </div>
  );
}
