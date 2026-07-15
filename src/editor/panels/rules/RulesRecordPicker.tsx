import { TutorialTip } from "../../components/TutorialTip";
import { ReferenceField, type ReferencePickerOption } from "../../ui";
import "./RulesRecordPicker.css";

export type RulesRecordPickerEntry = {
  id: number;
  label: string;
  detail: string;
  searchText?: string;
};

export function rulesRecordPickerOptions(entries: RulesRecordPickerEntry[]): ReferencePickerOption<number>[] {
  return entries.map((entry) => ({
    key: `rule-record:${entry.id}`,
    value: entry.id,
    label: entry.label,
    detail: entry.detail,
    searchText: `${entry.id} ${entry.label} ${entry.detail} ${entry.searchText ?? ""}`
  }));
}

export function RulesRecordPicker({
  label,
  help,
  options,
  value,
  placeholder,
  storageKey,
  onChange
}: {
  label: string;
  help: string;
  options: ReferencePickerOption<number>[];
  value: number;
  placeholder: string;
  storageKey: string;
  onChange: (value: number) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <div className="rules-reference-picker-field">
      <TutorialTip title={label} body={help} side="below">
        <span className="rules-reference-picker-label">{label}</span>
      </TutorialTip>
      <ReferenceField
        ariaLabel={`Search ${label.toLowerCase()} records`}
        placeholder={placeholder}
        options={options}
        value={value}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `${label} ${value}`,
          detail: `Record ${value} is not available.`,
          state: "unresolved"
        }}
        resultNoun="record"
        resultNounPlural="records"
        emptyTitle={`No matching ${label.toLowerCase()} records`}
        emptyBody={`Try a ${label.toLowerCase()} name, numeric ID, or record detail.`}
        compact
        compactPanelTitle={`${label} Picker`}
        compactStorageKey={storageKey}
        onChange={onChange}
      />
    </div>
  );
}
