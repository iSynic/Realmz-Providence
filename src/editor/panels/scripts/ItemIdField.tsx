import { useMemo, useState, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import {
  filterItemReferenceOptions,
  itemCategoryBadge,
  itemOptionDisplayName,
  itemReferenceDetail,
  itemReferenceOptions,
  type ItemReferenceOption
} from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";

export function ItemIdField({ project, catalog, label, value, onCommit, compact = false }: { project: Project; catalog?: LibraryCatalog | null; label: string; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim();
  const queryNumber = /^-?\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
  const matchedOptions = useMemo(() => {
    if (!normalizedQuery) return [];
    return filterItemReferenceOptions(options, normalizedQuery).slice(0, 12);
  }, [normalizedQuery, options]);
  const rawQueryOption: ItemReferenceOption | null =
    queryNumber != null && !options.some((option) => option.value === queryNumber)
      ? {
        key: `raw-item:${queryNumber}`,
        value: queryNumber,
        label: queryNumber === 0 ? "Empty / none (0)" : `Item ${queryNumber} (${queryNumber})`,
        category: "unknown",
        detail: itemReferenceDetail(project, queryNumber, catalog),
        summary: itemReferenceDetail(project, queryNumber, catalog),
        sourceState: queryNumber === 0 ? "" : "Raw item ID",
        iconId: null
      }
      : null;
  const resultOptions = rawQueryOption ? [rawQueryOption, ...matchedOptions] : matchedOptions;
  const selectedLabel = selected ? itemOptionDisplayName(selected) : value === 0 ? "No item selected" : `Item ${value}`;
  const selectedDetail = selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, value, catalog);
  const chooseItem = (option: ItemReferenceOption) => {
    onCommit(option.value);
    setQuery("");
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      return;
    }
    if (event.key !== "Enter") return;
    const firstOption = resultOptions[0];
    if (!firstOption) return;
    event.preventDefault();
    chooseItem(firstOption);
  };
  return (
    <div className={`script-item-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search item # or name..."
        aria-label={`Search ${label} items`}
      />
      {normalizedQuery ? (
        <div className="script-item-results" aria-live="polite">
          {resultOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.value === value ? "selected" : ""}
              title={[option.label, option.detail, option.sourceState].filter(Boolean).join(" | ")}
              onClick={() => chooseItem(option)}
            >
              <b>{itemCategoryBadge(option.category)}</b>
              <strong>{option.label}</strong>
              <small>{[option.detail, option.sourceState].filter(Boolean).join(" | ") || "No details available."}</small>
            </button>
          ))}
          {resultOptions.length === 0 && <small>No items match this search.</small>}
          {matchedOptions.length === 12 && <small>Keep typing to narrow more item matches.</small>}
        </div>
      ) : (
        <div className={`script-item-selected-row${value === 0 ? " missing" : ""}`}>
          <div>
            <strong>{selectedLabel}</strong>
            <small>{selectedDetail}</small>
          </div>
          {value !== 0 && (
            <button
              type="button"
              className="btn btn-danger btn-xs icon-only"
              title={`Clear ${label}`}
              aria-label={`Clear ${label}`}
              onClick={() => onCommit(0)}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
