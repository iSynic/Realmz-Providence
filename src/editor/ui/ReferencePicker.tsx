import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { EmptyState } from "./WorkbenchPrimitives";
import { IncrementalListFooter } from "./IncrementalListFooter";
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
  initialVisibleCount?: number;
  visibleCountStep?: number;
  className?: string;
  disabled?: boolean;
  autoFocusSearch?: boolean;
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
  initialVisibleCount,
  visibleCountStep = initialVisibleCount,
  className,
  disabled = false,
  autoFocusSearch = false
}: ReferencePickerProps<TValue>) {
  const resultsId = `reference-picker-results-${useId()}`;
  const filteredOptions = filterReferencePickerOptions(options, query);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount ?? Number.POSITIVE_INFINITY);
  const [activeOptionKey, setActiveOptionKey] = useState<string | null>(null);
  useEffect(() => {
    setVisibleCount(initialVisibleCount ?? Number.POSITIVE_INFINITY);
  }, [initialVisibleCount, query]);
  const visibleOptions = initialVisibleCount == null
    ? filteredOptions
    : filteredOptions.slice(0, visibleCount);
  const hiddenOptionCount = Math.max(0, filteredOptions.length - visibleOptions.length);
  const selectableOptions = visibleOptions.filter((option) => !option.disabled);
  const firstSelectable = selectableOptions[0] ?? null;
  const activeOption = selectableOptions.find((option) => option.key === activeOptionKey) ?? null;
  const activeOptionIndex = activeOption
    ? visibleOptions.findIndex((option) => option.key === activeOption.key)
    : -1;
  useEffect(() => {
    if (activeOptionIndex < 0 || typeof document === "undefined") return;
    document.getElementById(`${resultsId}-option-${activeOptionIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionIndex, resultsId]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const action = referencePickerKeyboardAction(event.key, query, Boolean(firstSelectable));
    if (action === "clear") {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange("");
      setActiveOptionKey(null);
      return;
    }
    if (action === "move-next" || action === "move-previous") {
      event.preventDefault();
      setActiveOptionKey(nextReferencePickerActiveKey(
        selectableOptions,
        activeOptionKey,
        action === "move-next" ? 1 : -1
      ));
      return;
    }
    if (action !== "select-first" || (!activeOption && !firstSelectable)) return;
    event.preventDefault();
    onSelect(activeOption ?? firstSelectable!);
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
        onChange={(nextQuery) => {
          onQueryChange(nextQuery);
          setActiveOptionKey(null);
        }}
        onKeyDown={handleSearchKeyDown}
        disabled={disabled}
        autoFocus={autoFocusSearch}
        modalInitialFocus={autoFocusSearch}
        combobox={{
          controls: resultsId,
          expanded: showResults,
          activeDescendant: activeOptionIndex >= 0 ? `${resultsId}-option-${activeOptionIndex}` : undefined
        }}
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
        <div className="workbench-reference-results-shell">
          <div id={resultsId} className="workbench-reference-results" role="listbox" aria-label={`${ariaLabel} results`}>
            {visibleOptions.map((option, optionIndex) => (
              <button
                key={option.key}
                id={`${resultsId}-option-${optionIndex}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={[
                  option.value === value ? "is-selected" : "",
                  option.key === activeOption?.key ? "is-active" : "",
                  option.preview ? "has-preview" : ""
                ].filter(Boolean).join(" ")}
                data-reference-option={option.key}
                title={option.title}
                disabled={disabled || option.disabled}
                onMouseEnter={() => setActiveOptionKey(option.key)}
                onFocus={() => setActiveOptionKey(option.key)}
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
          <IncrementalListFooter
            visibleCount={visibleOptions.length}
            totalCount={filteredOptions.length}
            step={visibleCountStep}
            noun={resultNoun}
            nounPlural={resultNounPlural}
            disabled={disabled}
            onShowMore={() => setVisibleCount((count) => count + (visibleCountStep ?? hiddenOptionCount))}
          />
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
): "clear" | "select-first" | "move-next" | "move-previous" | null {
  if (key === "Escape" && query) return "clear";
  if (key === "ArrowDown" && hasSelectableResult) return "move-next";
  if (key === "ArrowUp" && hasSelectableResult) return "move-previous";
  if (key === "Enter" && hasSelectableResult) return "select-first";
  return null;
}

export function nextReferencePickerActiveKey<TValue extends ReferencePickerValue>(
  options: ReferencePickerOption<TValue>[],
  activeKey: string | null,
  direction: -1 | 1
) {
  const selectable = options.filter((option) => !option.disabled);
  if (selectable.length === 0) return null;
  const currentIndex = selectable.findIndex((option) => option.key === activeKey);
  if (currentIndex < 0) return direction > 0 ? selectable[0].key : selectable[selectable.length - 1].key;
  const nextIndex = Math.max(0, Math.min(selectable.length - 1, currentIndex + direction));
  return selectable[nextIndex].key;
}

export function filterReferencePickerOptions<TValue extends ReferencePickerValue>(
  options: ReferencePickerOption<TValue>[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return options;
  const matches = options.filter((option) => {
    const searchText = option.searchText.toLowerCase();
    return terms.every((term) => searchText.includes(term));
  });
  return matches
    .map((option, index) => ({ option, index, exactValue: String(option.value).toLowerCase() === normalizedQuery }))
    .sort((left, right) => Number(right.exactValue) - Number(left.exactValue) || left.index - right.index)
    .map(({ option }) => option);
}
