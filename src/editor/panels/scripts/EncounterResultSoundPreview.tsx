import { useEffect, useMemo, useState } from "react";
import {
  soundReferenceOptionForQuery,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode,
  type ScriptTargetOption
} from "../../components/RealmzTargetPicker";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import { FloatingWorkbenchPanel, ReferencePicker, ReferencePreview, type ReferencePickerOption } from "../../ui";

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

  const selectedDetail = selectedOption
    ? [selectedOption.detail, selectedOption.summary, selectedOption.compatibility, selectedOption.sourceState].filter(Boolean).join(" | ")
    : selectedSoundId
      ? "Reference only; no preview source loaded"
      : "Choose a sound to preview.";

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
            detail: selectedDetail,
            state: selectedOption ? "resolved" : selectedSoundId ? "unresolved" : "empty"
          }}
          resultNoun="sound"
          resultNounPlural="sounds"
          emptyTitle="No matching sounds"
          emptyBody="Try a sound name, numeric ID, or snd resource reference."
        />
        <ReferencePreview preview={{
          key: selectedOption?.key ?? `sound:${selectedSoundId}`,
          kind: "audio",
          title: selectedOption?.label ?? (selectedSoundId ? `Sound ${Math.abs(selectedSoundId)}` : "No Sound Selected"),
          detail: selectedDetail,
          src: selectedPreviewUrl,
          onPlay: selectedPreviewUrl ? () => playPreviewUrl(selectedPreviewUrl) : undefined,
          state: selectedPreviewUrl ? "resolved" : "unavailable"
        }} />
      </div>
    </FloatingWorkbenchPanel>
  );
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
