import { useEffect, useMemo, useState } from "react";
import {
  soundReferenceOptionForQuery,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode,
  type ScriptTargetOption
} from "../../components/RealmzTargetPicker";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import {
  FloatingWorkbenchPanel,
  ReferencePicker,
  ReferencePreview,
  type ReferenceAudioPreview,
  type ReferencePickerOption
} from "../../ui";

export function EncounterResultSoundPreview({
  project,
  catalog,
  previewContext,
  onClose
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onClose: () => void;
}) {
  const options = useMemo(() => targetOptionsForOpcode(project, 9, catalog), [catalog, project]);
  const [query, setQuery] = useState("");
  const [selectedSoundId, setSelectedSoundId] = useState(0);
  const typedSoundOption = useMemo(() => soundReferenceOptionForQuery(9, query), [query]);
  const effectiveOptions = useMemo(() => withTypedSoundOption(options, typedSoundOption), [options, typedSoundOption]);
  const referenceOptions = useMemo(() => soundPreviewReferenceOptions(effectiveOptions), [effectiveOptions]);
  const selectedOption = useMemo(
    () => targetOptionForOpcodeValue(project, 9, selectedSoundId, catalog),
    [catalog, project, selectedSoundId]
  );
  const selectedPreviewUrl = useEncounterSoundPreviewUrl(selectedOption, selectedSoundId, project, previewContext);

  useEffect(() => {
    if (selectedSoundId !== 0 || options.length === 0) return;
    const previewable = options.find((option) => option.previewPath || option.managedAsset?.previewPath || option.libraryAsset?.previewPath);
    setSelectedSoundId(Math.abs(previewable?.value ?? options[0].value));
  }, [options, selectedSoundId]);

  const selectedPreview = encounterSoundReferencePreviewModel(selectedOption, selectedSoundId, selectedPreviewUrl);

  return (
    <FloatingWorkbenchPanel
      title="Preview Sound"
      eyebrow="Encounter Results"
      storageKey="encounters.soundPreview.position"
      defaultWidth={560}
      defaultHeight={430}
      minWidth={420}
      minHeight={320}
      className="encounter-sound-preview-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="encounter-sound-preview-body">
        <ReferencePicker
          className="encounter-sound-reference-picker"
          label="Sound"
          ariaLabel="Search sound preview options"
          placeholder="Search sounds or type snd 624..."
          query={query}
          onQueryChange={setQuery}
          options={referenceOptions}
          value={selectedSoundId}
          onSelect={(option) => {
            setSelectedSoundId(Math.abs(option.value));
            setQuery("");
          }}
          current={{
            label: selectedOption?.label ?? (selectedSoundId ? `Sound ${Math.abs(selectedSoundId)}` : "No Sound Selected"),
            detail: selectedPreview.detail,
            state: selectedOption ? "resolved" : selectedSoundId ? "unresolved" : "empty"
          }}
          resultNoun="sound"
          resultNounPlural="sounds"
          emptyTitle="No matching sounds"
          emptyBody="Try a sound name, numeric ID, or snd resource reference."
        />
        <ReferencePreview preview={selectedPreview} />
      </div>
    </FloatingWorkbenchPanel>
  );
}

export function encounterSoundReferencePreviewModel(
  option: ScriptTargetOption | null,
  soundId: number,
  previewUrl: string | null,
  emptyLabel = "No Sound Selected"
): ReferenceAudioPreview {
  const resolvedId = Math.abs(soundId || option?.value || 0);
  const title = option?.label ?? (resolvedId ? `Sound ${resolvedId}` : emptyLabel);
  const detail = option
    ? [option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ")
    : resolvedId
      ? "Reference only; no preview source loaded"
      : "Choose a sound to preview.";
  return {
    key: option?.key ?? `sound:${resolvedId}`,
    kind: "audio",
    title,
    detail,
    src: previewUrl,
    onPlay: previewUrl ? () => playPreviewUrl(previewUrl) : undefined,
    state: previewUrl ? "resolved" : "unavailable"
  };
}

export function withTypedSoundOption(
  options: ScriptTargetOption[],
  typedSoundOption: ScriptTargetOption | null
) {
  if (typedSoundOption && !options.some((option) => Math.abs(option.value) === Math.abs(typedSoundOption.value))) {
    return [typedSoundOption, ...options];
  }
  return options;
}

export function soundPreviewReferenceOptions(options: ScriptTargetOption[]): ReferencePickerOption<number>[] {
  return options.map((option) => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: [option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | "),
    searchText: [option.value, option.label, option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" ")
  }));
}

export function useEncounterSoundPreviewUrl(
  option: ScriptTargetOption | null,
  soundId: number,
  project: Project,
  previewContext: PreviewRuntimeContext
) {
  const resourceId = soundId ? Math.abs(soundId) : option?.value ?? null;
  return useResolvedPreviewUrl(
    option?.previewPath ?? option?.managedAsset?.previewPath ?? option?.libraryAsset?.previewPath ?? null,
    option?.managedAsset ?? null,
    option?.libraryAsset ?? null,
    { ...previewContext, project, resourceType: "snd ", resourceId }
  );
}
