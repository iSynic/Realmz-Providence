import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  itemOptionDisplayName,
  itemReferenceDetail,
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

export function ComplexEncounterItemResponseField({
  project,
  catalog,
  responseNumber,
  value,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  responseNumber: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const options = useMemo(() => deduplicatedItemResponseOptions(project, catalog), [catalog, project]);
  const selected = options.find((option) => option.value === value) ?? null;
  const selectedDetail = selected
    ? [selected.label, selected.detail, selected.sourceState].filter(Boolean).join(" | ")
    : value === 0
      ? "No item response selected"
      : `Imported item ID ${value}`;
  return (
    <label className="complex-encounter-item-response-field" title={selectedDetail}>
      <select
        value={String(value)}
        aria-label={`Item response ${responseNumber}`}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      >
        <option value="0">No item</option>
        {value !== 0 && !selected && <option value={String(value)}>{`Item ${value}`}</option>}
        {options.map((option) => (
          <option key={option.key} value={String(option.value)}>{itemOptionDisplayName(option)}</option>
        ))}
      </select>
    </label>
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
  const selectedSpell = kind === "magic" ? spellOptions.find((option) => option.value === value) ?? null : null;
  const selectedItem = kind === "item" ? itemOptions.find((option) => option.value === value) ?? null : null;
  const referenceOptions = useMemo(
    () => encounterResponseReferenceOptions(kind, spellOptions, itemOptions),
    [itemOptions, kind, spellOptions]
  );
  const isEmpty = value === 0 || (kind === "magic" && value === MAGIC_RESPONSE_BLANK_SPELL_ID);
  const selectedLabel = kind === "magic"
    ? selectedSpell?.label ?? (isEmpty ? "No spell or scroll selected" : `Unknown spell/scroll ${value}`)
    : selectedItem ? itemOptionDisplayName(selectedItem) : value === 0 ? "No item selected" : `Item ${value}`;
  const selectedDetail = kind === "magic"
    ? selectedSpell?.detail ?? (isEmpty ? "This response does not test a spell or scroll." : `Imported spell/scroll ID ${value}`)
    : selectedItem
      ? [selectedItem.detail, selectedItem.sourceState].filter(Boolean).join(" | ")
      : itemReferenceDetail(project, value, catalog);
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
          value={isEmpty ? 0 : value}
          onSelect={(option) => {
            onChange(option.value);
            setQuery("");
          }}
          current={{
            label: selectedLabel,
            detail: selectedDetail,
            state: isEmpty ? "empty" : selectedSpell || selectedItem ? "resolved" : "unresolved"
          }}
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

export function SpellResponseField({
  project,
  catalog,
  label,
  value,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const options = useMemo(() => spellReferenceOptions(project, catalog), [project, catalog]);
  const displayValue = value === MAGIC_RESPONSE_BLANK_SPELL_ID ? 0 : value;
  const selected = options.find((option) => option.value === displayValue);
  const visible = useMemo(() => {
    const next = options.slice(0, 260);
    if (selected && !next.some((option) => option.value === selected.value)) return [selected, ...next.slice(0, 219)];
    return next;
  }, [options, selected]);
  return (
    <label className="script-spell-response-field compact">
      <span>{label}</span>
      <select value={displayValue} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>No spell or scroll</option>
        {displayValue !== 0 && !options.some((option) => option.value === displayValue) && (
          <option value={displayValue}>Unknown spell/scroll {displayValue}</option>
        )}
        {visible.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <small>{selected ? selected.detail : displayValue ? `Unknown spell/scroll ${displayValue}` : "No spell or scroll selected."}</small>
    </label>
  );
}
