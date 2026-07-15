import { useEffect, useMemo, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { TutorialTip } from "../../components/TutorialTip";
import {
  spellAnimationFrameIds,
  spellAnimationHint,
  spellAnimationIsBlank,
  type SpellAnimationZeroMode
} from "../../resourceIds";
import { findLibraryResourceAsset } from "../../resourceResolver";
import type { LibraryAsset } from "../../types";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import "./RulesPresentationFields.css";

const MAX_BUILT_IN_SPELL_ANIMATION = 16;

export type RulesSpellAnimationReference = {
  value: number;
  firstFrameId: number;
  frameIconIds: number[];
  asset: LibraryAsset;
};

export function rulesSpellAnimationReferences(assets: LibraryAsset[]): RulesSpellAnimationReference[] {
  const byValue = new Map<number, RulesSpellAnimationReference>();
  for (const asset of assets) {
    const resourceId = asset.resourceId;
    if ((asset.resourceType ?? "").trim().toLowerCase() !== "cicn" || resourceId == null) continue;
    const value = spellAnimationValueFromFirstFrameId(resourceId);
    if (value == null || byValue.has(value)) continue;
    byValue.set(value, {
      value,
      firstFrameId: resourceId,
      frameIconIds: spellAnimationFrameIds(value, "blank-cast"),
      asset
    });
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}

export function rulesSpellAnimationOptions(
  references: RulesSpellAnimationReference[],
  zeroMode: SpellAnimationZeroMode,
  previewUrls: Map<number, string | null> = new Map()
): ReferencePickerOption<number>[] {
  const zeroFrames = spellAnimationFrameIds(0, zeroMode);
  const zeroPreview = zeroMode === "blank-cast"
    ? {
        kind: "custom" as const,
        key: "rules-spell-animation:blank",
        title: "Blank Cast Animation",
        content: <AnimationSwatch blank />
      }
    : {
        kind: "image" as const,
        key: "rules-spell-animation:default-resolution",
        title: "Default Resolution Animation",
        src: previewUrls.get(5) ?? null,
        alt: "Default resolution animation preview",
        state: previewUrls.get(5) ? "resolved" as const : "unavailable" as const
      };
  const options: ReferencePickerOption<number>[] = [{
    key: `rules-spell-animation:${zeroMode}:0`,
    value: 0,
    label: zeroMode === "blank-cast" ? "Blank Cast Animation" : "Default Resolution Animation",
    detail: zeroMode === "blank-cast"
      ? "Stored value 0 | no cast animation"
      : `Stored value 0 | cicn ${zeroFrames[0]}-${zeroFrames[zeroFrames.length - 1]}`,
    searchText: `0 ${zeroMode === "blank-cast" ? "blank cast no animation" : `default resolution cicn ${zeroFrames.join(" ")}`}`,
    preview: zeroPreview
  }];
  for (const reference of references) {
    const previewUrl = previewUrls.get(reference.value) ?? null;
    options.push({
      key: `rules-spell-animation:${zeroMode}:${reference.value}`,
      value: reference.value,
      label: `Animation ${reference.value}`,
      detail: `Stored value ${reference.value} | cicn ${reference.frameIconIds[0]}-${reference.frameIconIds[reference.frameIconIds.length - 1]}`,
      searchText: `${reference.value} animation ${reference.asset.label} ${reference.asset.source} cicn ${reference.frameIconIds.join(" ")}`,
      preview: {
        kind: "image",
        key: `rules-spell-animation-preview:${reference.value}`,
        title: `Animation ${reference.value}`,
        src: previewUrl,
        alt: `Animation ${reference.value} first frame`,
        state: previewUrl ? "resolved" : "unavailable"
      }
    });
  }
  return options;
}

export function rulesSpellAnimationValueForQuery(query: string) {
  const queryNumber = numericReferenceQuery(query);
  if (queryNumber == null) return null;
  return spellAnimationValueFromFirstFrameId(queryNumber) ?? queryNumber;
}

export function rulesSpellAnimationRawOption(
  query: string,
  zeroMode: SpellAnimationZeroMode,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = rulesSpellAnimationValueForQuery(query);
  if (value == null || options.some((option) => option.value === value)) return null;
  const frames = spellAnimationFrameIds(value, zeroMode);
  return {
    key: `rules-spell-animation:${zeroMode}:raw:${value}`,
    value,
    label: `Animation ${value}`,
    detail: frames.length > 0
      ? `Raw stored value | cicn ${frames[0]}-${frames[frames.length - 1]}`
      : "Raw stored value | blank cast animation",
    searchText: `${value} raw unresolved animation ${frames.join(" ")}`
  };
}

export function RulesSpellAnimationField({
  label,
  value,
  assets,
  onCommit,
  disabled = false,
  zeroMode,
  help
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  onCommit: (value: number) => void;
  disabled?: boolean;
  zeroMode: SpellAnimationZeroMode;
  help?: string;
}) {
  const references = useMemo(() => rulesSpellAnimationReferences(assets), [assets]);
  const firstFrameAssets = useMemo(() => references.map((reference) => reference.asset), [references]);
  const firstFramePreviews = useRulesLibraryAssetPreviews(firstFrameAssets);
  const previewUrls = useMemo(() => new Map(references.map((reference, index) => [
    reference.value,
    firstFramePreviews[index] ?? null
  ])), [firstFramePreviews, references]);
  const options = useMemo(
    () => rulesSpellAnimationOptions(references, zeroMode, previewUrls),
    [previewUrls, references, zeroMode]
  );
  const frameAssets = useMemo(
    () => spellAnimationFrameIds(value, zeroMode).map((resourceId) => findLibraryResourceAsset(assets, "cicn", resourceId, "icon")),
    [assets, value, zeroMode]
  );
  const framePreviews = useRulesLibraryAssetPreviews(frameAssets);
  const animationPreviewUrls = useMemo(
    () => framePreviews.filter((preview): preview is string => Boolean(preview)),
    [framePreviews]
  );
  const animatedPreview = useAnimatedPreview(animationPreviewUrls);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const blank = spellAnimationIsBlank(value, zeroMode);
  const current = selectedOption ? {
    label: selectedOption.label,
    detail: selectedOption.detail,
    state: blank ? "empty" as const : "resolved" as const
  } : {
    label: `Animation ${value}`,
    detail: `${spellAnimationHint(value, zeroMode)} is not available in the reference library.`,
    state: "unresolved" as const
  };

  return (
    <div className="scenario-field rules-presentation-reference-field">
      {help ? (
        <TutorialTip title={label} body={help} side="below">
          <span className="rules-presentation-reference-label">{label}</span>
        </TutorialTip>
      ) : <span className="rules-presentation-reference-label">{label}</span>}
      <div className="rules-presentation-reference-control">
        <AnimationSwatch src={animatedPreview} blank={blank} unresolved={!blank && !animatedPreview} />
        <ReferenceField
          ariaLabel={`Search ${label.toLowerCase()}`}
          placeholder="Search animation value or cicn frame ID..."
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          currentSupplement={(
            <ReferencePreview
              preview={{
                kind: "custom",
                key: `rules-spell-animation-current:${zeroMode}:${value}`,
                title: current.label,
                detail: current.detail,
                content: <AnimationSwatch src={animatedPreview} blank={blank} unresolved={!blank && !animatedPreview} />,
                state: current.state === "unresolved" ? "unavailable" : "resolved"
              }}
            />
          )}
          disabled={disabled}
          rawOptionForQuery={(query) => rulesSpellAnimationRawOption(query, zeroMode, options)}
          resultNoun="animation"
          resultNounPlural="animations"
          emptyTitle="No matching animations"
          emptyBody="Try a stored animation value or the cicn ID of its first frame."
          compact
          compactPanelTitle={`${label} Picker`}
          compactStorageKey={`rules.spell.${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.position`}
          onChange={(nextValue) => {
            if (!disabled) onCommit(nextValue);
          }}
        />
      </div>
    </div>
  );
}

function spellAnimationValueFromFirstFrameId(resourceId: number) {
  if (resourceId < 12000 || resourceId > 12120 || (resourceId - 12000) % 8 !== 0) return null;
  const value = (resourceId - 12000) / 8 + 1;
  return value <= MAX_BUILT_IN_SPELL_ANIMATION ? value : null;
}

function AnimationSwatch({ src, blank = false, unresolved = false }: { src?: string | null; blank?: boolean; unresolved?: boolean }) {
  return (
    <span className={[
      "rules-presentation-preview",
      "is-animation",
      blank ? "is-blank" : "",
      unresolved ? "is-unresolved" : ""
    ].filter(Boolean).join(" ")}>
      {src && <img src={src} alt="" />}
    </span>
  );
}

function useRulesLibraryAssetPreviews(assets: Array<LibraryAsset | null>) {
  const [previews, setPreviews] = useState<Array<string | null>>(() => assets.map((asset) => asset?.previewPath ?? null));
  useEffect(() => {
    let disposed = false;
    setPreviews(assets.map((asset) => asset?.previewPath ?? null));
    Promise.all(assets.map(async (asset) => {
      if (!asset) return null;
      if (asset.previewPath) return asset.previewPath;
      try {
        return await loadBrowserBundledLibraryAssetPreview(asset);
      } catch {
        return asset.previewPath ?? null;
      }
    })).then((urls) => {
      if (!disposed) setPreviews(urls);
    });
    return () => {
      disposed = true;
    };
  }, [assets]);
  return previews;
}

function useAnimatedPreview(previews: string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (previews.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % previews.length);
    }, 180);
    return () => window.clearInterval(timer);
  }, [previews]);
  return previews[index] ?? null;
}
