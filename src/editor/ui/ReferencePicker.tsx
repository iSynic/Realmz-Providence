import type { KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "./WorkbenchPrimitives";
import type { ReferencePreviewModel } from "./ReferencePreview";
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
  preview?: ReferencePreviewModel;
};

export type ReferencePickerCurrent = {
  label: ReactNode;
  detail?: ReactNode;
  state?: "resolved" | "empty" | "unresolved";
};

export type ReferencePickerProps<TValue extends ReferencePickerValue = number> = {
  label?: ReactNode;
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
  disabled?: boolean;
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
  className,
  disabled = false
}: ReferencePickerProps<TValue>) {
  const filteredOptions = filterReferencePickerOptions(options, query);
  const firstSelectable = filteredOptions.find((option) => !option.disabled) ?? null;

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const action = referencePickerKeyboardAction(event.key, query, Boolean(firstSelectable));
    if (action === "clear") {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange("");
      return;
    }
    if (action !== "select-first" || !firstSelectable) return;
    event.preventDefault();
    onSelect(firstSelectable);
  }

  return (
    <div className={[
      "workbench-reference-picker",
      currentSupplement ? "has-current-supplement" : undefined,
      className
    ].filter(Boolean).join(" ")}>
      <SearchField
        label={label}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        value={query}
        onChange={onQueryChange}
        onKeyDown={handleSearchKeyDown}
        disabled={disabled}
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
              className={[
                option.value === value ? "is-selected" : "",
                option.preview ? "has-preview" : ""
              ].filter(Boolean).join(" ")}
              data-reference-option={option.key}
              title={option.title}
              disabled={disabled || option.disabled}
              onClick={() => onSelect(option)}
            >
              {option.preview && (
                <span
                  className={`workbench-reference-option-preview is-${option.preview.state ?? "resolved"}`}
                  data-reference-option-preview={option.preview.key}
                >
                  {referenceOptionPreview(option.preview)}
                </span>
              )}
              <span className="workbench-reference-option-copy">
                <strong>{option.label}</strong>
                {option.detail && <small>{option.detail}</small>}
              </span>
            </button>
          ))}
          {filteredOptions.length === 0 && <EmptyState compact title={emptyTitle} body={emptyBody} />}
        </div>
      )}
    </div>
  );
}

function referenceOptionPreview(preview: ReferencePreviewModel) {
  if (preview.kind === "image") {
    return preview.src
      ? <img src={preview.src} alt={preview.alt} />
      : <span className="workbench-reference-option-preview-placeholder" aria-hidden="true" />;
  }
  if (preview.kind === "custom") return preview.content;
  return <span className="workbench-reference-option-preview-placeholder" aria-hidden="true" />;
}

export function referencePickerKeyboardAction(
  key: string,
  query: string,
  hasSelectableResult: boolean
): "clear" | "select-first" | null {
  if (key === "Escape" && query) return "clear";
  if (key === "Enter" && hasSelectableResult) return "select-first";
  return null;
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
