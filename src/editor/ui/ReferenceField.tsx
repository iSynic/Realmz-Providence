import { useState, type ReactNode } from "react";
import { Search, Trash2, X } from "lucide-react";
import {
  ReferencePicker,
  type ReferencePickerCurrent,
  type ReferencePickerOption
} from "./ReferencePicker";
import { FloatingWorkbenchPanel } from "./WorkbenchPrimitives";

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
  compact?: boolean;
  compactPanelTitle?: ReactNode;
  compactStorageKey?: string;
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
  compact = false,
  compactPanelTitle,
  compactStorageKey,
  onChange
}: ReferenceFieldProps) {
  const [query, setQuery] = useState("");
  const [compactPickerOpen, setCompactPickerOpen] = useState(false);
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
  const picker = (
    <ReferencePicker
      className={["workbench-reference-field", className, compact ? "workbench-reference-floating-picker" : undefined].filter(Boolean).join(" ")}
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
        if (compact) setCompactPickerOpen(false);
      }}
      current={current}
      currentActions={actions}
      currentSupplement={currentSupplement}
      showResults={compact || Boolean(query.trim())}
      resultNoun={resultNoun}
      resultNounPlural={resultNounPlural}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
    />
  );

  if (compact) {
    const referenceLabel = ariaLabel.replace(/^Search\s+/i, "") || "reference";
    const panelTitle = compactPanelTitle ?? referenceLabel;
    const storageKey = compactStorageKey ?? `referencePicker.${referenceStorageKey(ariaLabel)}.position`;
    return (
      <div className={["workbench-reference-compact", className].filter(Boolean).join(" ")}>
        <button
          type="button"
          className={`workbench-reference-compact-trigger is-${current.state ?? "resolved"}`}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={compactPickerOpen}
          disabled={disabled}
          title={typeof current.detail === "string" ? current.detail : undefined}
          onClick={() => setCompactPickerOpen(true)}
        >
          <Search size={12} aria-hidden="true" />
          <span>{current.label}</span>
        </button>
        {compactPickerOpen && (
          <FloatingWorkbenchPanel
            title={panelTitle}
            eyebrow="Reference Picker"
            storageKey={storageKey}
            defaultWidth={620}
            defaultHeight={560}
            minWidth={420}
            minHeight={320}
            className="workbench-reference-picker-panel"
            actions={(
              <button
                type="button"
                className="btn btn-secondary btn-xs icon-only"
                aria-label={`Close ${referenceLabel.toLowerCase()} picker`}
                title="Close"
                onClick={() => {
                  setCompactPickerOpen(false);
                  setQuery("");
                }}
              >
                <X size={12} />
              </button>
            )}
          >
            {picker}
          </FloatingWorkbenchPanel>
        )}
      </div>
    );
  }

  return picker;
}

export function numericReferenceQuery(query: string) {
  const normalized = query.trim();
  return /^-?\d+$/.test(normalized) ? Number(normalized) : null;
}

function referenceStorageKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "target";
}
