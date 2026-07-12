import { useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import {
  filterTargetOptions,
  soundReferenceOptionForQuery,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode,
  type ScriptTargetOption
} from "../../components/RealmzTargetPicker";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project } from "../../types";
import { FloatingWorkbenchPanel } from "../../ui";

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
  const filteredOptions = useMemo(() => {
    const matches = filterTargetOptions(options, query);
    if (typedSoundOption && !matches.some((option) => Math.abs(option.value) === Math.abs(typedSoundOption.value))) {
      return [typedSoundOption, ...matches];
    }
    return matches;
  }, [options, query, typedSoundOption]);
  const selectedOption = useMemo(
    () => targetOptionForOpcodeValue(project, 9, selectedSoundId, catalog),
    [catalog, project, selectedSoundId]
  );
  const visibleOptions = selectedOption && !filteredOptions.some((option) => option.key === selectedOption.key)
    ? [selectedOption, ...filteredOptions.slice(0, 159)]
    : filteredOptions.slice(0, 160);
  const selectedPreviewUrl = useEncounterSoundPreviewUrl(selectedOption, selectedSoundId, project, previewContext);

  useEffect(() => {
    if (selectedSoundId !== 0 || visibleOptions.length === 0) return;
    const previewable = visibleOptions.find((option) => option.previewPath || option.managedAsset?.previewPath || option.libraryAsset?.previewPath);
    setSelectedSoundId(previewable?.value ?? visibleOptions[0].value);
  }, [selectedSoundId, visibleOptions]);

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
        <label className="encounter-sound-preview-picker">
          <span>Sound</span>
          <input
            type="search"
            value={query}
            placeholder="Search sounds or type snd 624..."
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <select
            value={selectedSoundId ? String(Math.abs(selectedSoundId)) : ""}
            onChange={(event) => setSelectedSoundId(Number(event.currentTarget.value))}
          >
            <option value="">Choose sound...</option>
            {visibleOptions.map((option) => (
              <option key={option.key} value={Math.abs(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <section className="encounter-sound-preview-card">
          <header>
            <Volume2 size={16} />
            <div>
              <strong>{selectedOption?.label ?? (selectedSoundId ? `Sound ${Math.abs(selectedSoundId)}` : "No Sound Selected")}</strong>
              <small>{selectedDetail}</small>
            </div>
          </header>
          <div className="encounter-sound-preview-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!selectedPreviewUrl}
              title={selectedPreviewUrl ? "Play this sound preview." : "No playable preview is available for this sound."}
              onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
            >
              <Volume2 size={13} /> Play
            </button>
            {!selectedPreviewUrl && (
              <span>No playable preview is available. Reference-only sounds can still be used with the Play Sound code.</span>
            )}
          </div>
        </section>
        {filteredOptions.length > visibleOptions.length && (
          <small className="target-picker-empty">{filteredOptions.length - visibleOptions.length} more sound(s); search to narrow.</small>
        )}
      </div>
    </FloatingWorkbenchPanel>
  );
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
