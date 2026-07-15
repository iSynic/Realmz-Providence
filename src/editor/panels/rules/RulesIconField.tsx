import { useEffect, useMemo, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { TutorialTip } from "../../components/TutorialTip";
import { racePortraitSetFirstIconId } from "../../resourceIds";
import { findLibraryResourceAsset, isPortraitIconAsset } from "../../resourceResolver";
import type { LibraryAsset } from "../../types";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import "./RulesIconField.css";

export type RulesIconMode = "direct" | "portrait-set";

export type RulesIconReference = {
  value: number;
  resourceId: number;
  asset: LibraryAsset;
};

export function rulesIconReferences(assets: LibraryAsset[], mode: RulesIconMode): RulesIconReference[] {
  const byValue = new Map<number, RulesIconReference>();
  for (const asset of assets) {
    const resourceId = asset.resourceId;
    if ((asset.resourceType ?? "").trim().toLowerCase() !== "cicn" || resourceId == null) continue;
    if (!isPortraitIconAsset(asset)) continue;
    if (mode === "portrait-set" && !isPortraitSetFirstIcon(resourceId)) continue;
    const value = mode === "portrait-set" ? (resourceId - 251) / 6 : resourceId;
    if (!byValue.has(value)) byValue.set(value, { value, resourceId, asset });
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}

export function rulesIconReferenceOptions(
  references: RulesIconReference[],
  mode: RulesIconMode
): ReferencePickerOption<number>[] {
  return references.map(({ value, resourceId, asset }) => ({
    key: `rules-icon:${mode}:${value}`,
    value,
    label: mode === "portrait-set"
      ? `Portrait Set ${value}`
      : asset.label.trim() || `Icon ${resourceId}`,
    detail: mode === "portrait-set"
      ? `${asset.label.trim() || "First portrait"} | first cicn ${resourceId}`
      : `cicn ${resourceId} | ${asset.source}`,
    searchText: `${asset.label} ${asset.source} ${value} cicn ${resourceId} ${mode === "portrait-set" ? "portrait set" : "icon"}`
  }));
}

export function rulesIconValueForQuery(query: string, mode: RulesIconMode) {
  const queryNumber = numericReferenceQuery(query);
  if (queryNumber == null) return null;
  if (mode === "portrait-set" && isPortraitSetFirstIcon(queryNumber)) return (queryNumber - 251) / 6;
  return queryNumber;
}

export function rulesIconRawOption(
  query: string,
  mode: RulesIconMode,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = rulesIconValueForQuery(query, mode);
  if (value == null || options.some((option) => option.value === value)) return null;
  const resourceId = rulesIconResourceId(value, mode);
  return {
    key: `rules-icon:${mode}:raw:${value}`,
    value,
    label: mode === "portrait-set" ? `Portrait Set ${value}` : `Icon ${value}`,
    detail: mode === "portrait-set"
      ? `Raw stored set value | first cicn ${resourceId}`
      : `Raw unresolved cicn ${resourceId}`,
    searchText: `${value} cicn ${resourceId} raw unresolved ${mode === "portrait-set" ? "portrait set" : "icon"}`
  };
}

export function RulesIconField({
  label,
  value,
  assets,
  mode,
  onCommit,
  disabled = false,
  help
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  mode: RulesIconMode;
  onCommit: (value: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  const references = useMemo(() => rulesIconReferences(assets, mode), [assets, mode]);
  const options = useMemo(() => rulesIconReferenceOptions(references, mode), [references, mode]);
  const resourceId = rulesIconResourceId(value, mode);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const selectedAsset = findLibraryResourceAsset(assets, "cicn", resourceId, "icon", isPortraitIconAsset);
  const previewUrl = useRulesIconPreview(selectedAsset);
  const current = selectedOption ? {
    label: selectedOption.label,
    detail: selectedOption.detail,
    state: "resolved" as const
  } : {
    label: mode === "portrait-set" ? `Portrait Set ${value}` : `Icon ${value}`,
    detail: mode === "portrait-set"
      ? `First portrait cicn ${resourceId} is not available in the reference library.`
      : `cicn ${resourceId} is not available in the reference library.`,
    state: "unresolved" as const
  };

  return (
    <div className="scenario-field rules-icon-reference-field">
      {help ? (
        <TutorialTip title={label} body={help} side="below">
          <span className="rules-icon-reference-label">{label}</span>
        </TutorialTip>
      ) : <span className="rules-icon-reference-label">{label}</span>}
      <div className="rules-icon-reference-control">
        <span
          className={`rules-icon-reference-thumbnail ${previewUrl ? "is-resolved" : "is-unresolved"}`}
          title={previewUrl ? `cicn ${resourceId}` : `No preview for cicn ${resourceId}`}
        >
          {previewUrl
            ? <img src={previewUrl} alt={`${label} cicn ${resourceId}`} />
            : <b>{resourceId}</b>}
        </span>
        <ReferenceField
          ariaLabel={`Search ${label.toLowerCase()}`}
          placeholder={mode === "portrait-set"
            ? "Search portrait set, name, or first cicn ID..."
            : "Search icon name or cicn ID..."}
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          currentSupplement={(
            <ReferencePreview
              preview={{
                kind: "image",
                key: `rules-icon-preview:${mode}:${value}`,
                title: current.label,
                detail: current.detail,
                src: previewUrl,
                alt: `${label} cicn ${resourceId}`,
                state: previewUrl ? "resolved" : "unavailable"
              }}
            />
          )}
          disabled={disabled}
          rawOptionForQuery={(query) => rulesIconRawOption(query, mode, options)}
          resultNoun={mode === "portrait-set" ? "portrait set" : "icon"}
          resultNounPlural={mode === "portrait-set" ? "portrait sets" : "icons"}
          emptyTitle={mode === "portrait-set" ? "No matching portrait sets" : "No matching icons"}
          emptyBody={mode === "portrait-set"
            ? "Try a portrait-set value, portrait name, or first cicn resource ID."
            : "Try an icon name or cicn resource ID."}
          compact
          compactPanelTitle={`${label} Picker`}
          compactStorageKey={`rules.${mode}.${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.position`}
          onChange={(nextValue) => {
            if (!disabled) onCommit(nextValue);
          }}
        />
      </div>
    </div>
  );
}

function isPortraitSetFirstIcon(resourceId: number) {
  return resourceId >= 251 && (resourceId - 251) % 6 === 0;
}

function rulesIconResourceId(value: number, mode: RulesIconMode) {
  return mode === "portrait-set" ? racePortraitSetFirstIconId(value) : value;
}

function useRulesIconPreview(asset: LibraryAsset | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(asset?.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!asset) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(asset.previewPath ?? null);
    loadBrowserBundledLibraryAssetPreview(asset)
      .then((url) => {
        if (!disposed) setPreviewUrl(url ?? asset.previewPath ?? null);
      })
      .catch(() => {
        if (!disposed) setPreviewUrl(asset.previewPath ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [asset]);
  return previewUrl;
}
