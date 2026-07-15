import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  itemOptionDisplayName,
  type ItemReferenceOption
} from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { FloatingWorkbenchPanel, ReferencePicker, type ReferencePickerOption } from "../../ui";
import {
  deduplicatedItemResponseOptions,
  spellReferenceOptions,
  type SpellResponseOption
} from "./encounterResponseOptions";

export const MAGIC_RESPONSE_BLANK_SPELL_ID = 1100;

export type EncounterResponseSelection = {
  label: string;
  detail: string;
  state: "resolved" | "empty" | "unresolved";
};

export function encounterResponseSelection(
  kind: "magic" | "item",
  value: number,
  spellOptions: SpellResponseOption[],
  itemOptions: ItemReferenceOption[]
): EncounterResponseSelection {
  if (kind === "magic") {
    if (value === 0 || value === MAGIC_RESPONSE_BLANK_SPELL_ID) {
      return {
        label: "No spell or scroll selected",
        detail: "This response does not test a spell or scroll.",
        state: "empty"
      };
    }
    const selected = spellOptions.find((option) => option.value === value);
    return selected
      ? { label: selected.label, detail: selected.detail, state: "resolved" }
      : {
          label: `Unknown spell/scroll ${value}`,
          detail: `Imported spell/scroll ID ${value}`,
          state: "unresolved"
        };
  }
  if (value === 0) {
    return {
      label: "No item selected",
      detail: "This response does not test an item.",
      state: "empty"
    };
  }
  const selected = itemOptions.find((option) => option.value === value);
  return selected
    ? {
        label: itemOptionDisplayName(selected),
        detail: [selected.detail, selected.sourceState].filter(Boolean).join(" | ") || "No details available.",
        state: "resolved"
      }
    : {
        label: `Item ${value}`,
        detail: `Imported item ID ${value}`,
        state: "unresolved"
      };
}

export function ComplexEncounterResponseValue({
  kind,
  responseNumber,
  selection
}: {
  kind: "magic" | "item";
  responseNumber: number;
  selection: EncounterResponseSelection;
}) {
  return (
    <output
      className={`complex-encounter-response-value is-${selection.state}`}
      aria-label={`${kind === "magic" ? "Magic" : "Item"} response ${responseNumber} selection`}
      title={selection.detail}
    >
      <span>{selection.label}</span>
    </output>
  );
}

export function ComplexEncounterResponsePickerPanel({
  project,
  catalog,
  kind,
  responseNumber,
  value,
  onChange,
  onClose
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  kind: "magic" | "item";
  responseNumber: number;
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const spellOptions = useMemo(() => spellReferenceOptions(project, catalog), [catalog, project]);
  const itemOptions = useMemo(() => deduplicatedItemResponseOptions(project, catalog), [catalog, project]);
  const referenceOptions = useMemo(
    () => encounterResponseReferenceOptions(kind, spellOptions, itemOptions),
    [itemOptions, kind, spellOptions]
  );
  const selection = encounterResponseSelection(kind, value, spellOptions, itemOptions);
  const responseLabel = kind === "magic" ? "Magic Response" : "Item Response";
  return (
    <FloatingWorkbenchPanel
      title={`${responseLabel} ${responseNumber}`}
      eyebrow={kind === "magic" ? "Spell / Scroll Picker" : "Item Picker"}
      storageKey={`encounters.${kind}ResponsePicker.position`}
      defaultWidth={620}
      defaultHeight={560}
      minWidth={420}
      minHeight={320}
      className="complex-encounter-response-picker-panel"
      actions={(
        <button
          type="button"
          className="btn btn-secondary btn-xs icon-only"
          aria-label={`Close ${responseLabel.toLowerCase()} picker`}
          title="Close"
          onClick={onClose}
        >
          <X size={12} />
        </button>
      )}
    >
      <div className="complex-encounter-response-picker-body">
        <ReferencePicker
          className="complex-encounter-response-reference-picker"
          label={kind === "magic" ? "Search spells, scrolls, and spell classes" : "Search items"}
          placeholder={kind === "magic" ? "Search spell, class, or ID..." : "Search item name, category, or ID..."}
          ariaLabel={`Search ${responseLabel.toLowerCase()} options`}
          query={query}
          onQueryChange={setQuery}
          options={referenceOptions}
          value={selection.state === "empty" ? 0 : value}
          onSelect={(option) => {
            onChange(option.value);
            setQuery("");
          }}
          current={selection}
          resultNoun="option"
          resultNounPlural="options"
          emptyTitle="No matches"
          emptyBody="Try a name, category, or numeric ID from the response list."
        />
      </div>
    </FloatingWorkbenchPanel>
  );
}

export function encounterResponseReferenceOptions(
  kind: "magic" | "item",
  spellOptions: SpellResponseOption[],
  itemOptions: ItemReferenceOption[]
): ReferencePickerOption<number>[] {
  const emptyOption: ReferencePickerOption<number> = {
    key: `${kind}:none`,
    value: 0,
    label: kind === "magic" ? "No spell or scroll" : "No item",
    detail: "Do not require this response target.",
    searchText: "none empty clear"
  };
  if (kind === "magic") {
    return [emptyOption, ...spellOptions.map((option) => ({
      key: option.key,
      value: option.value,
      label: option.label,
      detail: option.detail,
      searchText: `${option.value} ${option.label} ${option.detail}`
    }))];
  }
  return [emptyOption, ...itemOptions.map((option) => ({
    key: option.key,
    value: option.value,
    label: `${itemOptionDisplayName(option)} #${option.value}`,
    detail: [option.detail, option.sourceState].filter(Boolean).join(" | ") || "No details available.",
    searchText: `${option.value} ${option.label} ${option.category} ${option.detail} ${option.sourceState}`
  }))];
}
