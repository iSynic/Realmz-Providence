import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Project, SelectedEntity } from "../../types";
import { ReferenceField, type ReferencePickerOption } from "../../ui";
import { selectEntityFromId } from "../../utils";

export type EncounterRecordPickerType = "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter";
type EncounterRecord =
  | Project["simpleEncounters"][number]
  | Project["complexEncounters"][number]
  | Project["thiefEncounters"][number]
  | Project["timedEncounters"][number];

export function encounterEntityId(recordType: EncounterRecordPickerType, id: number) {
  if (recordType === "simpleEncounter") return `encounter:simple:${id}`;
  if (recordType === "complexEncounter") return `encounter:complex:${id}`;
  if (recordType === "thiefEncounter") return `thief:${id}`;
  return `time:${id}`;
}

export function encounterRecordsForType(project: Project, recordType: EncounterRecordPickerType): EncounterRecord[] {
  const records =
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    project.timedEncounters;
  return [...(records ?? [])].sort((a, b) => a.id - b.id) as EncounterRecord[];
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
    const detail = encounterRecordSummary(project, recordType, record);
    return {
      key: `${recordType}:${record.id}`,
      value: record.id,
      label,
      detail,
      searchText: `${record.id} ${label} encounter record ${detail} ${encounterRecordSearchContent(project, recordType, record)}`
    };
  });
}

export function adjacentEncounterRecordId(
  records: Array<{ id: number }>,
  id: number,
  direction: -1 | 1
) {
  const currentIndex = records.findIndex((record) => record.id === id);
  if (currentIndex < 0) return null;
  return records[currentIndex + direction]?.id ?? null;
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
  const options = useMemo(() => encounterRecordPickerOptions(project, recordType), [project, recordType]);
  const selected = options.find((option) => option.value === id) ?? null;
  const records = useMemo(() => encounterRecordsForType(project, recordType), [project, recordType]);
  const currentIndex = records.findIndex((record) => record.id === id);
  const previousId = adjacentEncounterRecordId(records, id, -1);
  const nextId = adjacentEncounterRecordId(records, id, 1);
  const familyLabel = encounterRecordFamilyLabel(recordType);
  const selectRecord = (nextId: number) => {
    if (nextId === id) return;
    onSelectEntity?.(selectEntityFromId(encounterEntityId(recordType, nextId)));
  };
  return (
    <div className={`encounter-record-picker-row${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="btn btn-secondary btn-xs icon-only encounter-record-step"
        aria-label={`Previous ${familyLabel}`}
        title={`Previous ${familyLabel}`}
        disabled={!onSelectEntity || previousId == null}
        onClick={() => previousId != null && selectRecord(previousId)}
      >
        <ChevronLeft size={14} />
      </button>
      <ReferenceField
        className="encounter-record-picker"
        ariaLabel={`Search ${familyLabel} records`}
        placeholder={`Search ${familyLabel.toLowerCase()} #...`}
        options={options}
        value={id}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: encounterRecordLabel(recordType, id),
          detail: `Record ${id} is not present in this project.`,
          state: "unresolved"
        }}
        disabled={!onSelectEntity || options.length === 0}
        compact
        compactPanelTitle={`${familyLabel} Navigator`}
        compactStorageKey={`encounters.${recordType}.navigator.position`}
        resultNoun="record"
        resultNounPlural="records"
        emptyTitle={`No matching ${familyLabel.toLowerCase()} records`}
        emptyBody="Try a numeric record ID or encounter type."
        onChange={(nextId) => {
          selectRecord(nextId);
        }}
      />
      <button
        type="button"
        className="btn btn-secondary btn-xs icon-only encounter-record-step"
        aria-label={`Next ${familyLabel}`}
        title={`Next ${familyLabel}`}
        disabled={!onSelectEntity || nextId == null}
        onClick={() => nextId != null && selectRecord(nextId)}
      >
        <ChevronRight size={14} />
      </button>
      <span className="encounter-record-position" aria-label={`${familyLabel} position`}>
        {currentIndex >= 0 ? currentIndex + 1 : "-"} of {records.length}
      </span>
    </div>
  );
}

function encounterRecordSummary(project: Project, recordType: EncounterRecordPickerType, record: EncounterRecord) {
  if (recordType === "simpleEncounter") {
    const simple = record as Project["simpleEncounters"][number];
    const choiceCount = simple.texts?.slice(0, 4).filter((text) => text.trim()).length ?? 0;
    const resultCount = simple.actions?.filter((row) => row.rawCode !== 0 || row.id !== 0).length ?? 0;
    return joinRecordSummary(choiceCount ? `${choiceCount}/4 choices` : "no choices", `${resultCount} result steps`, encounterPromptExcerpt(project, simple.prompt, simple.texts));
  }
  if (recordType === "complexEncounter") {
    const complex = record as Project["complexEncounters"][number];
    const responseCount = [complex.actionResult, complex.wordResult, ...complex.spellResults, ...complex.itemResults]
      .filter((value) => value !== 0).length;
    const resultCount = complex.actions?.filter((row) => row.rawCode !== 0 || row.id !== 0).length ?? 0;
    return joinRecordSummary(`${responseCount} responses`, `${resultCount} result steps`, encounterPromptExcerpt(project, complex.prompt, complex.texts));
  }
  if (recordType === "thiefEncounter") {
    const rogue = record as Project["thiefEncounters"][number];
    const enabledCount = rogue.typeFlags?.slice(0, 8).filter(Boolean).length ?? 0;
    return joinRecordSummary(`${enabledCount}/8 actions`, encounterMessageExcerpt(project, rogue.prompts));
  }
  const timed = record as Project["timedEncounters"][number];
  const schedule = timed.day < 0 ? "inactive schedule" : `day ${timed.day}, every ${timed.increment}`;
  const location = timed.locationKind === "any" ? "any location" : `${timed.locationKind} level ${timed.requiredLevel}`;
  return joinRecordSummary(schedule, `${timed.percent}% chance`, location);
}

function encounterRecordSearchContent(project: Project, recordType: EncounterRecordPickerType, record: EncounterRecord) {
  if (recordType === "simpleEncounter" || recordType === "complexEncounter") {
    const encounter = record as Project["simpleEncounters"][number] | Project["complexEncounters"][number];
    return [messageText(project, encounter.prompt), ...(encounter.texts ?? [])].join(" ");
  }
  if (recordType === "thiefEncounter") {
    const rogue = record as Project["thiefEncounters"][number];
    return [...(rogue.prompts ?? []), ...(rogue.successText ?? []), ...(rogue.failureText ?? [])]
      .map((messageId) => messageText(project, messageId))
      .join(" ");
  }
  const timed = record as Project["timedEncounters"][number];
  return `${timed.day} ${timed.increment} ${timed.percent} ${timed.door} ${timed.requiredLevel} ${timed.requiredRandomRect} ${timed.requiredX} ${timed.requiredY} ${timed.requiredItem} ${timed.requiredQuest} ${timed.locationKind}`;
}

function encounterPromptExcerpt(project: Project, prompt: number, fallbackTexts: string[]) {
  return compactExcerpt(messageText(project, prompt) || fallbackTexts?.find((text) => text.trim()) || (prompt ? `Prompt string ${Math.abs(prompt)}` : "No prompt"));
}

function encounterMessageExcerpt(project: Project, messageIds: number[]) {
  const text = messageIds?.map((messageId) => messageText(project, messageId)).find(Boolean);
  return text ? compactExcerpt(text) : "No prompt text";
}

function messageText(project: Project, rawId: number) {
  const id = Math.abs(rawId);
  if (!id) return "";
  return project.messages?.find((message) => message.id === id)?.text?.trim() ?? "";
}

function compactExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 82 ? `${normalized.slice(0, 79)}...` : normalized;
}

function joinRecordSummary(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" | ");
}
