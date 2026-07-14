import { useState, type ReactNode } from "react";
import { Eye, Trash2 } from "lucide-react";
import type { SelectedEntity } from "../types";
import {
  ReferencePicker,
  type ReferencePickerCurrent,
  type ReferencePickerOption
} from "../ui";

export type EdcdRawReferenceOptionFactory = (
  query: string
) => ReferencePickerOption<number> | null;

export function EdcdReferenceTargetField({
  ariaLabel,
  placeholder,
  options,
  value,
  selectedValue = value,
  current,
  disabled = false,
  rawOptionForQuery,
  resultNoun = "target",
  resultNounPlural = "targets",
  emptyTitle = "No matching targets",
  emptyBody,
  selectedEntity,
  openLabel,
  clearLabel,
  currentSupplement,
  onChange,
  onOpen
}: {
  ariaLabel: string;
  placeholder: string;
  options: ReferencePickerOption<number>[];
  value: number;
  selectedValue?: number | null;
  current: ReferencePickerCurrent;
  disabled?: boolean;
  rawOptionForQuery?: EdcdRawReferenceOptionFactory;
  resultNoun?: string;
  resultNounPlural?: string;
  emptyTitle?: ReactNode;
  emptyBody: ReactNode;
  selectedEntity?: SelectedEntity | null;
  openLabel: string;
  clearLabel: string;
  currentSupplement?: ReactNode;
  onChange: (value: number) => void;
  onOpen?: (entity: SelectedEntity) => void;
}) {
  const [query, setQuery] = useState("");
  const rawOption = rawOptionForQuery?.(query) ?? null;
  const effectiveOptions = rawOption ? [rawOption, ...options] : options;
  const canOpen = Boolean(selectedEntity && onOpen);
  const canClear = value !== 0;
  const currentActions = canOpen || canClear ? (
    <>
      {canOpen && (
        <button
          type="button"
          className="btn btn-secondary btn-xs icon-only"
          disabled={disabled}
          title={openLabel}
          aria-label={openLabel}
          onClick={(event) => {
            event.preventDefault();
            if (selectedEntity) onOpen?.(selectedEntity);
          }}
        >
          <Eye size={12} />
        </button>
      )}
      {canClear && (
        <button
          type="button"
          className="btn btn-danger btn-xs icon-only"
          disabled={disabled}
          title={clearLabel}
          aria-label={clearLabel}
          onClick={(event) => {
            event.preventDefault();
            onChange(0);
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </>
  ) : undefined;

  return (
    <ReferencePicker
      className="edcd-reference-target-field"
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      options={effectiveOptions}
      value={selectedValue}
      disabled={disabled}
      onSelect={(option) => {
        onChange(option.value);
        setQuery("");
      }}
      current={current}
      currentActions={currentActions}
      currentSupplement={currentSupplement}
      showResults={Boolean(query.trim())}
      resultNoun={resultNoun}
      resultNounPlural={resultNounPlural}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
    />
  );
}

export function numericReferenceQuery(query: string) {
  const normalized = query.trim();
  return /^-?\d+$/.test(normalized) ? Number(normalized) : null;
}
