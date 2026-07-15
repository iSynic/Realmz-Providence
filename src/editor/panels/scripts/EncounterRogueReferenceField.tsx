import { ExternalLink } from "lucide-react";
import type { Project } from "../../types";
import { ReferenceField } from "../../ui";
import {
  encounterRecordLabel,
  encounterRecordPickerOptions
} from "./EncounterRecordPicker";

export function EncounterRogueReferenceField({
  project,
  value,
  disabled = false,
  onChange,
  onOpen
}: {
  project: Project;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onOpen?: (value: number) => void;
}) {
  const options = encounterRecordPickerOptions(project, "thiefEncounter");
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <ReferenceField
      className="encounter-rogue-reference-field"
      ariaLabel="Search Rogue Encounter target"
      placeholder="Search rogue encounter #..."
      options={options}
      value={value}
      selectedValue={selected?.value ?? null}
      current={selected ? {
        label: selected.label,
        detail: "This Rogue Encounter handles the enabled thief branch.",
        state: "resolved"
      } : {
        label: encounterRecordLabel("thiefEncounter", value),
        detail: `Record ${value} is not present in this project.`,
        state: "unresolved"
      }}
      disabled={disabled}
      resultNoun="record"
      resultNounPlural="records"
      emptyTitle="No matching Rogue Encounters"
      emptyBody="Try a numeric record ID. Only existing Rogue Encounters can be selected."
      currentActions={(
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          disabled={!selected || !onOpen}
          onClick={() => onOpen?.(value)}
        >
          <ExternalLink size={12} aria-hidden="true" />
          Open Rogue Encounter
        </button>
      )}
      onChange={onChange}
    />
  );
}
