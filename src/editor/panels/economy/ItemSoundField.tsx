import { useMemo } from "react";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import {
  numericReferenceQuery,
  ReferenceAudioPreviewAction,
  ReferenceField,
  type ReferencePickerOption
} from "../../ui";
import "./ItemSoundField.css";

export type ItemSoundReference = {
  value: number;
  label: string;
  detail: string;
  searchText: string;
};

export function itemSoundReferences(
  project: Project,
  catalog: LibraryCatalog | null | undefined
): ItemSoundReference[] {
  const references = new Map<number, ItemSoundReference>();
  const addReference = (resourceId: number | null | undefined, label: string, detail: string) => {
    if (resourceId == null || resourceId === 0 || !Number.isFinite(resourceId)) return;
    const value = Math.abs(Math.trunc(resourceId));
    const normalizedLabel = label.trim() || `snd ${value}`;
    const normalizedDetail = detail.trim();
    const existing = references.get(value);
    if (existing) {
      existing.searchText = `${existing.searchText} ${normalizedLabel} ${normalizedDetail}`.trim();
      if (normalizedDetail && !existing.detail.includes(normalizedDetail)) {
        existing.detail = [existing.detail, normalizedDetail].filter(Boolean).join(" | ");
      }
      return;
    }
    references.set(value, {
      value,
      label: normalizedLabel,
      detail: normalizedDetail,
      searchText: `${value} snd ${normalizedLabel} ${normalizedDetail}`.trim()
    });
  };

  for (const asset of project.assets ?? []) {
    if (asset.kind !== "sound" && asset.resourceType.trim().toLowerCase() !== "snd") continue;
    addReference(
      asset.resourceId,
      asset.label,
      asset.libraryScope === "custom-library" ? "Providence Custom Library" : "Scenario Asset"
    );
  }
  for (const asset of project.assetCatalog.sounds ?? []) {
    addReference(asset.resourceId, asset.name || `snd ${asset.resourceId}`, itemSoundSourceLabel(asset.source, "Project Sound Catalog"));
  }
  for (const asset of catalog?.assets ?? []) {
    if (asset.type !== "sound" && (asset.resourceType ?? "").trim().toLowerCase() !== "snd") continue;
    addReference(asset.resourceId, asset.label, itemSoundSourceLabel(asset.source, "Reference Library"));
  }

  return [...references.values()].sort((left, right) => left.value - right.value);
}

function itemSoundSourceLabel(source: string | null | undefined, fallback: string) {
  const normalized = source?.trim() ?? "";
  if (!normalized) return fallback;
  if (/^library-source:realmz:/i.test(normalized)) return "Realmz Reference Library";
  if (/^library-source:/i.test(normalized)) return "Reference Library";
  return normalized;
}

export function itemSoundReferenceOptions(references: ItemSoundReference[]): ReferencePickerOption<number>[] {
  return references.map((reference) => ({
    key: `item-sound:${reference.value}`,
    value: reference.value,
    label: reference.label,
    detail: `snd ${reference.value}${reference.detail ? ` | ${reference.detail}` : ""}`,
    searchText: reference.searchText
  }));
}

export function itemSoundRawOption(
  query: string,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || value === 0 || !Number.isSafeInteger(value) || options.some((option) => option.value === value)) {
    return null;
  }
  const resourceId = Math.abs(value);
  return {
    key: `item-sound:raw:${value}`,
    value,
    label: `Sound value ${value}`,
    detail: `Raw stored item value | plays snd ${resourceId}`,
    searchText: `${value} snd ${resourceId} raw unresolved imported`
  };
}

export function ItemSoundField({
  value,
  project,
  catalog,
  previewContext,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChange: (value: number) => void;
}) {
  const references = useMemo(() => itemSoundReferences(project, catalog), [catalog, project]);
  const options = useMemo(() => itemSoundReferenceOptions(references), [references]);
  const selectedReference = references.find((reference) => reference.value === Math.abs(value)) ?? null;
  const selectedOption = value > 0 ? options.find((option) => option.value === value) ?? null : null;
  const previewUrl = useItemSoundPreviewUrl(value, project, catalog, previewContext);
  const current = value === 0 ? {
    label: "No sound",
    detail: "This item does not play a sound.",
    state: "empty" as const
  } : selectedReference ? {
    label: selectedReference.label,
    detail: `Stored value ${value} | snd ${Math.abs(value)}${selectedReference.detail ? ` | ${selectedReference.detail}` : ""}`,
    state: "resolved" as const
  } : {
    label: `Sound value ${value}`,
    detail: `snd ${Math.abs(value)} is not available in the current project or reference library.`,
    state: "unresolved" as const
  };

  return (
    <div className="item-sound-reference-field" title="Sound resource played when Realmz uses this item.">
      <span className="item-sound-reference-label">Sound</span>
      <div className="item-sound-reference-control">
        <ReferenceField
          ariaLabel="Search item sound"
          placeholder="Search sound name, stored value, or snd ID..."
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          rawOptionForQuery={(query) => itemSoundRawOption(query, options)}
          resultNoun="sound"
          resultNounPlural="sounds"
          emptyTitle="No matching item sounds"
          emptyBody="Try a sound name, stored item value, or snd resource ID."
          clearLabel="Clear item sound"
          compact
          compactPanelTitle="Item Sound Picker"
          compactStorageKey="economy.item.sound.picker.position"
          onChange={onChange}
        />
        <ReferenceAudioPreviewAction
          compact
          iconOnly
          ariaLabel="Preview item sound"
          preview={{
            kind: "audio",
            key: `item-sound-preview:${value}`,
            title: current.label,
            detail: current.detail,
            src: previewUrl,
            onPlay: previewUrl ? () => playPreviewUrl(previewUrl) : undefined,
            state: previewUrl ? "resolved" : "unavailable"
          }}
        />
      </div>
    </div>
  );
}

function useItemSoundPreviewUrl(
  soundId: number,
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
) {
  const resourceId = soundId ? Math.abs(soundId) : null;
  const managedAsset = resourceId == null ? null : (project.assets ?? []).find((asset) =>
    asset.kind === "sound" && Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const projectAsset = resourceId == null ? null : (project.assetCatalog.sounds ?? []).find((asset) =>
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const libraryAsset = resourceId == null ? null : catalog?.assets.find((asset) =>
    (asset.type === "sound" || (asset.resourceType ?? "").trim() === "snd") &&
    asset.resourceId != null && Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  return useResolvedPreviewUrl(
    managedAsset?.previewPath ?? projectAsset?.previewPath ?? libraryAsset?.previewPath ?? null,
    managedAsset,
    libraryAsset,
    { ...previewContext, project, resourceType: "snd ", resourceId }
  );
}
