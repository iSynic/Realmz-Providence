import { useEffect, useState } from "react";
import {
  itemCategoryBadge,
  itemReferenceOptions,
  type ItemReferenceOption
} from "../../itemReferences";
import { useIconPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";

export function ItemOptionIcon({
  option,
  project,
  catalog,
  previewContext
}: {
  option: ItemReferenceOption;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
}) {
  const iconUrl = useIconPreviewUrl(option.iconId, project, catalog, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [iconUrl]);
  const usableUrl = iconUrl && iconUrl !== failedUrl ? iconUrl : null;
  return (
    <span className="item-option-icon" title={option.iconId ? `cicn ${option.iconId}` : `${itemCategoryBadge(option.category)} item`}>
      {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{itemCategoryBadge(option.category)}</i>}
    </span>
  );
}

export function useDeferredItemReferenceOptions(project: Project, catalog?: LibraryCatalog | null) {
  const [options, setOptions] = useState<ItemReferenceOption[] | null>(null);
  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      const next = itemReferenceOptions(project, catalog);
      if (!disposed) setOptions(next);
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [catalog, project]);
  return options;
}
