import { useMemo } from "react";
import {
  itemCategoryBadge,
  itemOptionDisplayName,
  itemReferenceDetail,
  itemReferenceOptions
} from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { ReferenceField, numericReferenceQuery, type ReferencePickerOption } from "../../ui";

export function ItemIdField({
  project,
  catalog,
  label,
  value,
  onCommit,
  compact = false
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  compact?: boolean;
}) {
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === value);
  const pickerOptions = useMemo(() => options.map((option): ReferencePickerOption<number> => ({
    key: option.key,
    value: option.value,
    label: `${itemCategoryBadge(option.category)} ${option.label}`,
    detail: [option.detail, option.sourceState].filter(Boolean).join(" | "),
    searchText: [option.value, option.label, option.category, option.detail, option.summary, option.sourceState].filter(Boolean).join(" "),
    title: [option.label, option.detail, option.sourceState].filter(Boolean).join(" | ")
  })), [options]);
  const selectedLabel = selected ? itemOptionDisplayName(selected) : value === 0 ? "No item selected" : `Item ${value}`;
  const selectedDetail = selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, value, catalog);

  return (
    <div className={`script-item-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <ReferenceField
        className="script-item-reference-field"
        placeholder="Search item # or name..."
        ariaLabel={`Search ${label} items`}
        options={pickerOptions}
        value={value}
        current={{
          label: selectedLabel,
          detail: selectedDetail,
          state: value === 0 ? "empty" : selected ? "resolved" : "unresolved"
        }}
        rawOptionForQuery={(query) => {
          const queryNumber = numericReferenceQuery(query);
          if (queryNumber == null || options.some((option) => option.value === queryNumber)) return null;
          const detail = itemReferenceDetail(project, queryNumber, catalog);
          return {
            key: `raw-item:${queryNumber}`,
            value: queryNumber,
            label: queryNumber === 0 ? "IT Empty / none (0)" : `IT Item ${queryNumber} (${queryNumber})`,
            detail,
            searchText: `${queryNumber} item raw ${detail}`
          };
        }}
        resultNoun="item"
        emptyTitle="No matching items"
        emptyBody="Try an item name, numeric ID, category, source, or use."
        clearLabel={`Clear ${label}`}
        onChange={onCommit}
      />
    </div>
  );
}
