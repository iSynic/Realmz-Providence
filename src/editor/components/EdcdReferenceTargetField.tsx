import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import type { SelectedEntity } from "../types";
import {
  ReferenceField,
  type RawReferenceOptionFactory,
  type ReferencePickerCurrent,
  type ReferencePickerOption
} from "../ui";

export type EdcdRawReferenceOptionFactory = RawReferenceOptionFactory;
export { numericReferenceQuery } from "../ui";

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
  const canOpen = Boolean(selectedEntity && onOpen);
  const currentActions = canOpen ? (
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
  ) : undefined;

  return (
    <ReferenceField
      className="edcd-reference-target-field"
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      options={options}
      value={value}
      selectedValue={selectedValue}
      current={current}
      disabled={disabled}
      rawOptionForQuery={rawOptionForQuery}
      resultNoun={resultNoun}
      resultNounPlural={resultNounPlural}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      clearLabel={clearLabel}
      currentActions={currentActions}
      currentSupplement={currentSupplement}
      onChange={onChange}
    />
  );
}
