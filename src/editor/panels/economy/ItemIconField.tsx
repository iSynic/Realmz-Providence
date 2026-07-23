import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ItemReferenceOption } from "../../itemReferences";
import { useIconPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import "./ItemIconField.css";

export type ItemIconReference = {
  id: number;
  label: string;
  detail: string;
  searchText: string;
};

export function itemIconReferences(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  itemOptions: ItemReferenceOption[]
) {
  const references = new Map<number, ItemIconReference>();
  const addReference = (id: number | null | undefined, label: string, detail: string) => {
    if (id == null || id === 0 || !Number.isFinite(id)) return;
    const normalizedId = Math.trunc(id);
    const normalizedLabel = label.trim() || `Icon ${normalizedId}`;
    const normalizedDetail = detail.trim();
    const existing = references.get(normalizedId);
    if (existing) {
      existing.searchText = `${existing.searchText} ${normalizedLabel} ${normalizedDetail}`.trim();
      if (normalizedDetail && !existing.detail.includes(normalizedDetail)) {
        existing.detail = [existing.detail, normalizedDetail].filter(Boolean).join(" | ");
      }
      return;
    }
    references.set(normalizedId, {
      id: normalizedId,
      label: normalizedLabel,
      detail: normalizedDetail,
      searchText: `${normalizedId} cicn ${normalizedLabel} ${normalizedDetail}`.trim()
    });
  };

  for (const asset of project.assets ?? []) {
    if (asset.kind === "icon" || asset.resourceType.trim() === "cicn") {
      addReference(asset.resourceId, asset.label, "project icon");
    }
  }
  for (const asset of project.assetCatalog.icons ?? []) {
    addReference(asset.resourceId, asset.name || `cicn ${asset.resourceId}`, asset.source || "project catalog");
  }
  for (const option of itemOptions) {
    addReference(option.iconId, option.label.replace(/\s+\(-?\d+\)$/, ""), `item ${option.value}`);
  }
  for (const asset of catalog?.assets ?? []) {
    const resourceType = (asset.resourceType ?? "").trim();
    if (asset.resourceId != null && (asset.type === "icon" || asset.type.includes("icon") || resourceType === "cicn")) {
      addReference(asset.resourceId, asset.label, asset.source || "library icon");
    }
  }

  return [...references.values()].sort((left, right) => Math.abs(left.id) - Math.abs(right.id) || left.id - right.id);
}

export function itemIconReferenceOptions(
  references: ItemIconReference[],
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
): ReferencePickerOption<number>[] {
  return references.map((reference) => ({
    key: `item-icon:${reference.id}`,
    value: reference.id,
    label: `cicn ${reference.id}: ${reference.label}`,
    detail: reference.detail,
    searchText: reference.searchText,
    preview: itemIconOptionPreview(reference.id, reference.label, project, catalog, previewContext)
  }));
}

export function itemIconRawOption(
  query: string,
  options: ReferencePickerOption<number>[],
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || value === 0 || options.some((option) => option.value === value)) return null;
  return {
    key: `item-icon:raw:${value}`,
    value,
    label: `cicn ${value}`,
    detail: "Raw icon resource ID",
    searchText: `${value} cicn raw icon resource id unresolved`,
    preview: itemIconOptionPreview(value, `cicn ${value}`, project, catalog, previewContext)
  };
}

export function ItemIconField({
  value,
  project,
  catalog,
  previewContext,
  itemOptions,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemOptions: ItemReferenceOption[];
  onChange: (value: number) => void;
}) {
  const references = useMemo(
    () => itemIconReferences(project, catalog, itemOptions),
    [catalog, itemOptions, project]
  );
  const options = useMemo(
    () => itemIconReferenceOptions(references, project, catalog, previewContext),
    [catalog, previewContext, project, references]
  );
  const selectedReference = references.find((reference) => reference.id === value) ?? null;
  const previewUrl = useItemIconPreview(value, project, catalog, previewContext);
  const current = value === 0 ? {
    label: "No Icon",
    detail: "This item does not reference a cicn resource.",
    state: "empty" as const
  } : selectedReference ? {
    label: `cicn ${value}: ${selectedReference.label}`,
    detail: selectedReference.detail,
    state: "resolved" as const
  } : {
    label: `cicn ${value}`,
    detail: "This imported icon ID is not listed in the current item or asset references.",
    state: "unresolved" as const
  };

  return (
    <div className="item-icon-reference-field" title="CICN resource ID drawn for this item in Realmz lists and menus.">
      <span className="item-icon-reference-label">Icon</span>
      <div className="item-icon-reference-control">
        <ItemIconThumbnail iconId={value} src={previewUrl} label={current.label} />
        <ReferenceField
          ariaLabel="Search item icon"
          placeholder="Search cicn ID, item, or source..."
          options={options}
          value={value}
          selectedValue={selectedReference?.id ?? null}
          current={current}
          currentSupplement={(
            <ReferencePreview
              preview={{
                kind: "image",
                key: `item-icon-preview:${value}`,
                title: current.label,
                detail: current.detail,
                src: previewUrl,
                alt: value ? `Item icon cicn ${value}` : "No item icon",
                state: previewUrl ? "resolved" : "unavailable"
              }}
            />
          )}
          rawOptionForQuery={(query) => itemIconRawOption(query, options, project, catalog, previewContext)}
          resultNoun="icon"
          resultNounPlural="icons"
          emptyTitle="No matching item icons"
          emptyBody="Try a cicn resource ID, item name, project asset, or library source."
          initialVisibleCount={160}
          visibleCountStep={160}
          clearLabel="Clear item icon"
          compact
          compactPanelTitle="Item Icon Picker"
          compactStorageKey="economy.item.icon.picker.position"
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function itemIconOptionPreview(
  iconId: number,
  label: string,
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
) {
  return {
    kind: "custom" as const,
    key: `item-icon-option-preview:${iconId}`,
    title: label,
    content: (
      <ItemIconOptionThumbnail
        iconId={iconId}
        label={label}
        project={project}
        catalog={catalog}
        previewContext={previewContext}
      />
    )
  };
}

function ItemIconOptionThumbnail({
  iconId,
  label,
  project,
  catalog,
  previewContext
}: {
  iconId: number;
  label: string;
  project: Project;
  catalog: LibraryCatalog | null | undefined;
  previewContext: PreviewRuntimeContext;
}) {
  const previewUrl = useItemIconPreview(iconId, project, catalog, previewContext);
  return <ItemIconThumbnail iconId={iconId} src={previewUrl} label={label} />;
}

function ItemIconThumbnail({ iconId, src, label }: { iconId: number; src: string | null; label: ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [src]);
  const usableUrl = src && src !== failedUrl ? src : null;
  return (
    <span className={`item-icon-reference-thumbnail ${usableUrl ? "is-resolved" : "is-unresolved"}`} title={typeof label === "string" ? label : undefined}>
      {usableUrl
        ? <img src={usableUrl} alt={typeof label === "string" ? label : `cicn ${iconId}`} onError={() => setFailedUrl(usableUrl)} />
        : <b>{iconId || "-"}</b>}
    </span>
  );
}

function useItemIconPreview(
  iconId: number,
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
) {
  return useIconPreviewUrl(iconId, project, catalog, previewContext);
}
