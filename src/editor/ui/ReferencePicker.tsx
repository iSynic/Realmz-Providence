import type { KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "./WorkbenchPrimitives";
import { SearchField } from "./SearchField";
import "./ReferencePicker.css";

export type ReferencePickerValue = string | number;

export type ReferencePickerOption<TValue extends ReferencePickerValue = number> = {
  key: string;
  value: TValue;
  label: ReactNode;
  detail?: ReactNode;
  searchText: string;
  title?: string;
  disabled?: boolean;
};

export type ReferencePickerCurrent = {
  label: ReactNode;
  detail?: ReactNode;
  state?: "resolved" | "empty" | "unresolved";
};

export type ReferencePickerProps<TValue extends ReferencePickerValue = number> = {
  label: ReactNode;
  ariaLabel: string;
  placeholder?: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: ReferencePickerOption<TValue>[];
  value: TValue | null;
  onSelect: (option: ReferencePickerOption<TValue>) => void;
  current: ReferencePickerCurrent;
  currentActions?: ReactNode;
  currentSupplement?: ReactNode;
  showResults?: boolean;
  resultNoun?: string;
  resultNounPlural?: string;
  emptyTitle?: ReactNode;
  emptyBody?: ReactNode;
  className?: string;
};

export function ReferencePicker<TValue extends ReferencePickerValue = number>({
  label,
  ariaLabel,
  placeholder,
  query,
  onQueryChange,
  options,
  value,
  onSelect,
  current,
  currentActions,
  currentSupplement,
  showResults = true,
  resultNoun = "match",
  resultNounPlural = "matches",
  emptyTitle = "No matches",
  emptyBody = "Try a name, numeric ID, category, or other target detail.",
  className
}: ReferencePickerProps<TValue>) {
  const filteredOptions = filterReferencePickerOptions(options, query);
  const firstSelectable = filteredOptions.find((option) => !option.disabled) ?? null;

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange("");
      return;
    }
    if (event.key !== "Enter" || !firstSelectable) return;
    event.preventDefault();
    onSelect(firstSelectable);
  }

  return (
    <div className={["workbench-reference-picker", className].filter(Boolean).join(" ")}>
      <SearchField
        label={label}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        value={query}
        onChange={onQueryChange}
        onKeyDown={handleSearchKeyDown}
        resultCount={showResults ? filteredOptions.length : undefined}
        resultNoun={resultNoun}
        resultNounPlural={resultNounPlural}
      />
      <section className={`workbench-reference-current is-${current.state ?? "resolved"}`}>
        <div>
          <span>Current Selection</span>
          <strong>{current.label}</strong>
          {current.detail && <small>{current.detail}</small>}
        </div>
        {currentActions && <div className="workbench-reference-current-actions">{currentActions}</div>}
      </section>
      {currentSupplement && <div className="workbench-reference-current-supplement">{currentSupplement}</div>}
      {showResults && (
        <div className="workbench-reference-results" role="listbox" aria-label={`${ariaLabel} results`}>
          {filteredOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              data-reference-option={option.key}
              title={option.title}
              disabled={option.disabled}
              onClick={() => onSelect(option)}
            >
              <strong>{option.label}</strong>
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
          {filteredOptions.length === 0 && <EmptyState compact title={emptyTitle} body={emptyBody} />}
        </div>
      )}
    </div>
  );
}

export function filterReferencePickerOptions<TValue extends ReferencePickerValue>(
  options: ReferencePickerOption<TValue>[],
  query: string
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return options;
  return options.filter((option) => {
    const searchText = option.searchText.toLowerCase();
    return terms.every((term) => searchText.includes(term));
  });
}
