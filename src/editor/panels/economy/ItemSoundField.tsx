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
  resourceId: number;
  label: string;
  detail: string;
  searchText: string;
};

const ITEM_SOUND_RESOURCE_OFFSET = 600;
const I16_MIN = -0x8000;
const I16_MAX = 0x7fff;

export function itemSoundResourceId(value: number) {
  if (!Number.isFinite(value) || value === 0) return null;
  const shifted = Math.trunc(value) + ITEM_SOUND_RESOURCE_OFFSET;
  const wrapped = ((shifted - I16_MIN) % 0x10000 + 0x10000) % 0x10000 + I16_MIN;
  return Math.abs(wrapped);
}

function itemSoundValueForResourceId(resourceId: number | null | undefined) {
  if (resourceId == null || !Number.isFinite(resourceId)) return null;
  const normalizedResourceId = Math.abs(Math.trunc(resourceId));
  const value = normalizedResourceId - ITEM_SOUND_RESOURCE_OFFSET;
  if (value === 0 || value < I16_MIN || value > I16_MAX) return null;
  return value;
}

export function itemSoundReferences(
  project: Project,
  catalog: LibraryCatalog | null | undefined
): ItemSoundReference[] {
  const references = new Map<number, ItemSoundReference>();
  const addReference = (resourceId: number | null | undefined, label: string, detail: string) => {
    const value = itemSoundValueForResourceId(resourceId);
    if (value == null || resourceId == null) return;
    const normalizedResourceId = Math.abs(Math.trunc(resourceId));
    const normalizedLabel = label.trim() || `snd ${normalizedResourceId}`;
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
      resourceId: normalizedResourceId,
      label: normalizedLabel,
      detail: normalizedDetail,
      searchText: `${value} snd ${normalizedResourceId} ${normalizedLabel} ${normalizedDetail}`.trim()
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
    key: `item-sound:${reference.resourceId}`,
    value: reference.value,
    label: reference.label,
    detail: `Item value ${reference.value} | snd ${reference.resourceId}${reference.detail ? ` | ${reference.detail}` : ""}`,
    searchText: reference.searchText
  }));
}

export function itemSoundRawOption(
  query: string,
  options: ReferencePickerOption<number>[],
  references: ItemSoundReference[] = []
): ReferencePickerOption<number> | null {
  const queryNumber = numericReferenceQuery(query);
  if (queryNumber == null || queryNumber === 0 || !Number.isSafeInteger(queryNumber)) {
    return null;
  }
  if (references.some((reference) => reference.resourceId === Math.abs(queryNumber))) return null;
  const value = queryNumber >= ITEM_SOUND_RESOURCE_OFFSET
    ? queryNumber - ITEM_SOUND_RESOURCE_OFFSET
    : queryNumber;
  if (value === 0 || value < I16_MIN || value > I16_MAX || options.some((option) => option.value === value)) {
    return null;
  }
  const resourceId = itemSoundResourceId(value);
  return {
    key: `item-sound:raw:${value}`,
    value,
    label: `Sound value ${value}`,
    detail: resourceId == null ? "Raw stored item sound value" : `Raw stored item value | plays snd ${resourceId}`,
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
  const selectedReference = references.find((reference) => reference.value === value) ?? null;
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const previewUrl = useItemSoundPreviewUrl(value, project, catalog, previewContext);
  const resourceId = itemSoundResourceId(value);
  const current = value === 0 ? {
    label: "No sound",
    detail: "This item does not play a sound.",
    state: "empty" as const
  } : selectedReference ? {
    label: selectedReference.label,
    detail: `Stored value ${value} | snd ${selectedReference.resourceId}${selectedReference.detail ? ` | ${selectedReference.detail}` : ""}`,
    state: "resolved" as const
  } : {
    label: `Sound value ${value}`,
    detail: resourceId == null
      ? "This raw stored item sound value is unresolved."
      : `snd ${resourceId} is not available in the current project or reference library.`,
    state: "unresolved" as const
  };

  return (
    <div className="item-sound-reference-field" title="Realmz adds 600 to this stored item value before playing the sound resource.">
      <span className="item-sound-reference-label">Sound</span>
      <div className="item-sound-reference-control">
        <ReferenceField
          ariaLabel="Search item sound"
          placeholder="Search sound name, stored value, or snd ID..."
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          rawOptionForQuery={(query) => itemSoundRawOption(query, options, references)}
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
  const resourceId = itemSoundResourceId(soundId);
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
