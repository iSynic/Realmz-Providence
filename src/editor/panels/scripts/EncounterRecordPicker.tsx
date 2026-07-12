import type { Project, SelectedEntity } from "../../types";
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
  if (recordType === "simpleEncounter") return `Simple Encounter ${id}`;
  if (recordType === "complexEncounter") return `Complex Encounter ${id}`;
  if (recordType === "thiefEncounter") return `Rogue Encounter ${id}`;
  return `Time Encounter ${id}`;
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
  const records = encounterRecordsForType(project, recordType);
  return (
    <div className={`encounter-record-picker-row${className ? ` ${className}` : ""}`}>
      <label className="encounter-record-picker">
        <span>Encounter Record</span>
        <select
          aria-label={`${encounterRecordLabel(recordType, id)} picker`}
          value={id}
          disabled={!onSelectEntity || records.length <= 1}
          onChange={(event) => {
            const nextId = Number(event.currentTarget.value);
            if (!Number.isInteger(nextId) || nextId === id) return;
            onSelectEntity?.(selectEntityFromId(encounterEntityId(recordType, nextId)));
          }}
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>{encounterRecordLabel(recordType, record.id)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
