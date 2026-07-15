import { useMemo } from "react";
import type { ItemReferenceOption } from "../../itemReferences";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import { IncrementalListFooter, ScrollArea, useIncrementalListLimit } from "../../ui";
import { itemOptionName } from "./economyRecordModel";
import { ItemOptionIcon } from "./ItemReferencePresentation";

const ITEM_POOL_PAGE_SIZE = 42;

export function EconomyItemPoolList({
  className,
  ariaLabel,
  options,
  optionsLoading,
  disabled,
  project,
  catalog,
  previewContext,
  onSelect
}: {
  className: string;
  ariaLabel: string;
  options: ItemReferenceOption[];
  optionsLoading: boolean;
  disabled: boolean;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onSelect: (itemId: number) => void;
}) {
  const [visibleLimit, showMore] = useIncrementalListLimit(ITEM_POOL_PAGE_SIZE, options);
  const visibleOptions = useMemo(() => options.slice(0, visibleLimit), [options, visibleLimit]);
  return (
    <ScrollArea className={className} aria-label={ariaLabel}>
      {visibleOptions.map((option) => (
        <button key={option.key} type="button" disabled={disabled} onClick={() => onSelect(option.value)}>
          <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
          <span>
            <strong>{itemOptionName(option)}</strong>
            <small>{option.detail}</small>
          </span>
          <b>{option.value}</b>
        </button>
      ))}
      <IncrementalListFooter
        visibleCount={visibleOptions.length}
        totalCount={options.length}
        step={ITEM_POOL_PAGE_SIZE}
        noun="item"
        onShowMore={showMore}
      />
      {optionsLoading && <p>Loading item references...</p>}
      {options.length === 0 && <p>No items match this category/search.</p>}
    </ScrollArea>
  );
}
