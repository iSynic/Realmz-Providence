import { useEffect, useMemo, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { TutorialTip } from "../../components/TutorialTip";
import { playPreviewUrl } from "../../previewUrls";
import { spellSoundResourceId } from "../../resourceIds";
import type { LibraryAsset } from "../../types";
import {
  numericReferenceQuery,
  ReferenceAudioPreviewAction,
  ReferenceField,
  type ReferencePickerOption
} from "../../ui";
import "./RulesSoundField.css";

export type RulesSoundReference = {
  value: number;
  resourceId: number;
  asset: LibraryAsset;
};

export function rulesSoundReferences(assets: LibraryAsset[]): RulesSoundReference[] {
  const byValue = new Map<number, RulesSoundReference>();
  for (const asset of assets) {
    const resourceId = asset.resourceId;
    if ((asset.resourceType ?? "").trim().toLowerCase() !== "snd" || resourceId == null || resourceId <= 600) continue;
    const value = resourceId - 600;
    if (!byValue.has(value)) byValue.set(value, { value, resourceId, asset });
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}

export function rulesSoundReferenceOptions(references: RulesSoundReference[]): ReferencePickerOption<number>[] {
  return references.map(({ value, resourceId, asset }) => ({
    key: `rules-sound:${resourceId}`,
    value,
    label: asset.label.trim() || `Sound ${resourceId}`,
    detail: `Spell value ${value} | snd ${resourceId}`,
    searchText: `${asset.label} ${asset.source} ${value} snd ${resourceId}`
  }));
}

export function rulesSoundValueForQuery(query: string) {
  const queryNumber = numericReferenceQuery(query);
  if (queryNumber == null) return null;
  return queryNumber >= 600 ? queryNumber - 600 : queryNumber;
}

export function rulesSoundRawOption(
  query: string,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = rulesSoundValueForQuery(query);
  if (value == null || options.some((option) => option.value === value)) return null;
  const resourceId = spellSoundResourceId(value);
  return {
    key: `rules-sound:raw:${value}`,
    value,
    label: value === 0 ? "No sound" : `Sound value ${value}`,
    detail: resourceId == null ? "Raw stored spell sound value" : `Raw stored value | snd ${resourceId}`,
    searchText: `${value} ${resourceId == null ? "" : `snd ${resourceId}`} raw unresolved`
  };
}

export function RulesSoundField({
  label,
  value,
  assets,
  onCommit,
  disabled = false,
  help
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  onCommit: (value: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  const references = useMemo(() => rulesSoundReferences(assets), [assets]);
  const options = useMemo(() => rulesSoundReferenceOptions(references), [references]);
  const selectedReference = references.find((reference) => reference.value === value) ?? null;
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const previewUrl = useRulesSoundPreview(selectedReference?.asset ?? null);
  const resourceId = spellSoundResourceId(value);
  const current = selectedOption ? {
    label: selectedOption.label,
    detail: selectedOption.detail,
    state: "resolved" as const
  } : value === 0 ? {
    label: "No sound",
    detail: "This spell stage does not play a sound.",
    state: "empty" as const
  } : {
    label: `Sound value ${value}`,
    detail: resourceId == null ? "This raw stored value is unresolved." : `snd ${resourceId} is not available in the reference library.`,
    state: "unresolved" as const
  };

  return (
    <div className="scenario-field rules-sound-reference-field">
      {help ? (
        <TutorialTip title={label} body={help} side="below">
          <span className="rules-sound-reference-label">{label}</span>
        </TutorialTip>
      ) : <span className="rules-sound-reference-label">{label}</span>}
      <div className="rules-sound-reference-control">
        <ReferenceField
          ariaLabel={`Search ${label.toLowerCase()}`}
          placeholder="Search sound name, value, or snd ID..."
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          disabled={disabled}
          rawOptionForQuery={(query) => rulesSoundRawOption(query, options)}
          resultNoun="sound"
          resultNounPlural="sounds"
          emptyTitle="No matching sounds"
          emptyBody="Try a sound name, stored spell value, or snd resource ID."
          clearLabel={`Clear ${label.toLowerCase()}`}
          compact
          compactPanelTitle={`${label} Picker`}
          compactStorageKey={`rules.spell.${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.position`}
          onChange={(nextValue) => {
            if (!disabled) onCommit(nextValue);
          }}
        />
        <ReferenceAudioPreviewAction
          compact
          iconOnly
          ariaLabel={`Preview ${label.toLowerCase()}`}
          preview={{
            kind: "audio",
            key: `rules-sound-preview:${value}`,
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

function useRulesSoundPreview(asset: LibraryAsset | null) {
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
