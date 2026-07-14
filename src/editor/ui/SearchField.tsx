import { useId, type KeyboardEventHandler, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import "./SearchField.css";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  placeholder?: string;
  ariaLabel?: string;
  resultCount?: number;
  resultNoun?: string;
  resultNounPlural?: string;
  status?: ReactNode;
  id?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

export function SearchField({
  value,
  onChange,
  label,
  placeholder = "Search...",
  ariaLabel,
  resultCount,
  resultNoun = "result",
  resultNounPlural,
  status,
  id,
  className,
  inputClassName,
  autoFocus = false,
  disabled = false,
  onKeyDown
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `workbench-search-${generatedId}`;
  const accessibleLabel = ariaLabel ?? (typeof label === "string" ? label : placeholder);
  const resultLabel = resultCount == null
    ? null
    : `${resultCount} ${resultCount === 1 ? resultNoun : resultNounPlural ?? `${resultNoun}s`}`;

  return (
    <div className={["workbench-search-field", className].filter(Boolean).join(" ")}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="workbench-search-control">
        <Search size={14} aria-hidden="true" />
        <input
          id={inputId}
          className={inputClassName}
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={accessibleLabel}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        {value && !disabled && (
          <button type="button" aria-label={`Clear ${accessibleLabel.toLowerCase()}`} title="Clear search" onClick={() => onChange("")}>
            <X size={13} />
          </button>
        )}
      </div>
      {(resultLabel || status) && (
        <div className="workbench-search-meta" aria-live="polite">
          {resultLabel && <span>{resultLabel}</span>}
          {status && <small>{status}</small>}
        </div>
      )}
    </div>
  );
}
