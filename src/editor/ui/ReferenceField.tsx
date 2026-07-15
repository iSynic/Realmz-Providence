import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  ReferencePicker,
  type ReferencePickerCurrent,
  type ReferencePickerOption
} from "./ReferencePicker";

export type RawReferenceOptionFactory = (
  query: string
) => ReferencePickerOption<number> | null;

export type ReferenceFieldProps = {
  ariaLabel: string;
  placeholder: string;
  options: ReferencePickerOption<number>[];
  value: number;
  selectedValue?: number | null;
  current: ReferencePickerCurrent;
  disabled?: boolean;
  rawOptionForQuery?: RawReferenceOptionFactory;
  resultNoun?: string;
  resultNounPlural?: string;
  emptyTitle?: ReactNode;
  emptyBody: ReactNode;
  clearLabel?: string;
  clearValue?: number;
  currentActions?: ReactNode;
  currentSupplement?: ReactNode;
  className?: string;
  onChange: (value: number) => void;
};

export function ReferenceField({
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
  clearLabel,
  clearValue = 0,
  currentActions,
  currentSupplement,
  className,
  onChange
}: ReferenceFieldProps) {
  const [query, setQuery] = useState("");
  const rawOption = rawOptionForQuery?.(query) ?? null;
  const effectiveOptions = rawOption ? [rawOption, ...options] : options;
  const canClear = clearLabel != null && value !== clearValue;
  const actions = currentActions || canClear ? (
    <>
      {currentActions}
      {canClear && (
        <button
          type="button"
          className="btn btn-danger btn-xs icon-only"
          disabled={disabled}
          title={clearLabel}
          aria-label={clearLabel}
          onClick={(event) => {
            event.preventDefault();
            onChange(clearValue);
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </>
  ) : undefined;

  return (
    <ReferencePicker
      className={["workbench-reference-field", className].filter(Boolean).join(" ")}
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
      currentActions={actions}
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
