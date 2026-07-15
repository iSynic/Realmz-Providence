import type { ReactNode } from "react";
import {
  itemOptionDisplayName,
  type ItemReferenceOption
} from "../../itemReferences";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import { ItemOptionIcon } from "./ItemReferencePresentation";
import "./EconomyItemReferenceField.css";

export function economyItemReferenceOptions(
  options: ItemReferenceOption[],
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
): ReferencePickerOption<number>[] {
  return options.map((option) => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: [option.detail, option.sourceState].filter(Boolean).join(" | "),
    searchText: [
      option.value,
      option.label,
      option.category,
      option.detail,
      option.summary,
      option.sourceState
    ].join(" "),
    preview: {
      kind: "custom",
      key: `economy-item-option:${option.key}`,
      title: option.label,
      content: (
        <ItemOptionIcon
          option={option}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
        />
      )
    }
  }));
}

export function economyRawItemOption(
  query: string,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || value === 0 || !Number.isSafeInteger(value) || options.some((option) => option.value === value)) {
    return null;
  }
  return {
    key: `economy-item:raw:${value}`,
    value,
    label: `Item ${value}`,
    detail: "Raw item ID not present in the decoded item catalog",
    searchText: `${value} raw item id unresolved imported`,
    preview: {
      kind: "custom",
      key: `economy-item-option:raw:${value}`,
      title: `Item ${value}`,
      content: <span className="item-option-icon"><i>IT</i></span>
    }
  };
}

export function EconomyItemReferenceField({
  value,
  option,
  options,
  ariaLabel,
  panelTitle,
  storageKey,
  emptyLabel = "Empty / none",
  emptyDetail = "This slot does not contain an item.",
  clearLabel = "Clear item slot",
  project,
  catalog,
  previewContext,
  onChange
}: {
  value: number;
  option?: ItemReferenceOption;
  options: ReferencePickerOption<number>[];
  ariaLabel: string;
  panelTitle: ReactNode;
  storageKey: string;
  emptyLabel?: string;
  emptyDetail?: string;
  clearLabel?: string;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChange: (value: number) => void;
}) {
  const current = value === 0 ? {
    label: emptyLabel,
    detail: emptyDetail,
    state: "empty" as const
  } : option ? {
    label: `${itemOptionDisplayName(option)} (${value})`,
    detail: [option.detail, option.sourceState].filter(Boolean).join(" | "),
    state: "resolved" as const
  } : {
    label: `Item ${value}`,
    detail: "This imported item ID is not present in the decoded item catalog.",
    state: "unresolved" as const
  };

  return (
    <div className="economy-item-reference-field">
      <ReferenceField
        ariaLabel={ariaLabel}
        placeholder="Search item #, name, category, or source..."
        options={options}
        value={value}
        selectedValue={option?.value ?? null}
        current={current}
        currentSupplement={(
          <ReferencePreview
            preview={{
              kind: "custom",
              key: `economy-item-current:${value}`,
              title: current.label,
              detail: current.detail,
              state: option ? "resolved" : value === 0 ? "unavailable" : "missing",
              content: (
                <div className="economy-item-reference-preview">
                  {option
                    ? <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
                    : <span className="item-option-icon"><i>IT</i></span>}
                  <span>
                    <strong>{current.label}</strong>
                    <small>{current.detail}</small>
                  </span>
                </div>
              )
            }}
          />
        )}
        rawOptionForQuery={(query) => economyRawItemOption(query, options)}
        resultNoun="item"
        resultNounPlural="items"
        emptyTitle="No matching items"
        emptyBody="Try an item ID, name, category, source, or enter a raw numeric ID."
        initialVisibleCount={160}
        visibleCountStep={160}
        clearLabel={clearLabel}
        compact
        compactPanelTitle={panelTitle}
        compactStorageKey={storageKey}
        onChange={onChange}
      />
    </div>
  );
}
