import type { Project, SelectedEntity } from "../../types";
import { ReferenceField, type ReferencePickerOption } from "../../ui";
import { selectEntityFromId } from "../../utils";

export type EncounterRecordPickerType = "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter";

export function encounterEntityId(recordType: EncounterRecordPickerType, id: number) {
  if (recordType === "simpleEncounter") return `encounter:simple:${id}`;
  if (recordType === "complexEncounter") return `encounter:complex:${id}`;
  if (recordType === "thiefEncounter") return `thief:${id}`;
  return `time:${id}`;
}

export function encounterRecordsForType(project: Project, recordType: EncounterRecordPickerType): Array<{ id: number }> {
  const records =
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    project.timedEncounters;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

export function encounterRecordLabel(recordType: EncounterRecordPickerType, id: number) {
  return `${encounterRecordFamilyLabel(recordType)} ${id}`;
}

export function encounterRecordFamilyLabel(recordType: EncounterRecordPickerType) {
  if (recordType === "simpleEncounter") return "Simple Encounter";
  if (recordType === "complexEncounter") return "Complex Encounter";
  if (recordType === "thiefEncounter") return "Rogue Encounter";
  return "Time Encounter";
}

export function encounterRecordPickerOptions(
  project: Project,
  recordType: EncounterRecordPickerType
): ReferencePickerOption<number>[] {
  return encounterRecordsForType(project, recordType).map((record) => {
    const label = encounterRecordLabel(recordType, record.id);
    return {
      key: `${recordType}:${record.id}`,
      value: record.id,
      label,
      detail: `Record ${record.id}`,
      searchText: `${record.id} ${label} encounter record`
    };
  });
}

export function EncounterRecordPicker({
  project,
  recordType,
  id,
  onSelectEntity,
  className = ""
}: {
  project: Project;
  recordType: EncounterRecordPickerType;
  id: number;
  onSelectEntity?: (entity: SelectedEntity) => void;
  className?: string;
}) {
  const options = encounterRecordPickerOptions(project, recordType);
  const selected = options.find((option) => option.value === id) ?? null;
  const familyLabel = encounterRecordFamilyLabel(recordType);
  return (
    <div className={`encounter-record-picker-row${className ? ` ${className}` : ""}`}>
      <ReferenceField
        className="encounter-record-picker"
        ariaLabel={`Search ${familyLabel} records`}
        placeholder={`Search ${familyLabel.toLowerCase()} #...`}
        options={options}
        value={id}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: `${options.length} ${options.length === 1 ? "record" : "records"} available`,
          state: "resolved"
        } : {
          label: encounterRecordLabel(recordType, id),
          detail: `Record ${id} is not present in this project.`,
          state: "unresolved"
        }}
        disabled={!onSelectEntity || options.length <= 1}
        resultNoun="record"
        resultNounPlural="records"
        emptyTitle={`No matching ${familyLabel.toLowerCase()} records`}
        emptyBody="Try a numeric record ID or encounter type."
        onChange={(nextId) => {
          if (nextId === id) return;
          onSelectEntity?.(selectEntityFromId(encounterEntityId(recordType, nextId)));
        }}
      />
    </div>
  );
}
