import { useState } from "react";
import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapPreviewFocalPoint,
  MapPreviewMode,
  ProjectCommand,
  RandomLevel,
  TilesetAsset
} from "../../types";
import { buildUpdateMapLevelSettingsCommand } from "./mapBrowserModel";
import { MapNumberField } from "./MapFormControls";

const STANDARD_LANDLOOK_OPTIONS = [
  { value: 0, label: "0 - Plains" },
  { value: 3, label: "3 - Subterranean" },
  { value: 4, label: "4 - Castle" },
  { value: 5, label: "5 - Desert" },
  { value: 6, label: "6 - Custom 1" },
  { value: 7, label: "7 - Custom 2" },
  { value: 8, label: "8 - Custom 3" },
  { value: 9, label: "9 - Swamp" },
  { value: 10, label: "10 - Snow" }
];

export function MapLevelSettings({
  map,
  randomLevel,
  selectedTileset,
  atlas,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onApplyCommand
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [applied, setApplied] = useState<string | null>(null);
  if (!map) return <p className="empty-copy compact">Select a map to edit Realmz level flags.</p>;
  const commit = (fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>) => {
    onApplyCommand(buildUpdateMapLevelSettingsCommand(map, fields));
    setApplied("Applied");
    window.setTimeout(() => setApplied(null), 1200);
  };
  const atlasMissing = map.levelType === "land" && selectedTileset && !atlas && !selectedTileset.imagePath;
  const currentLandlook = randomLevel?.landlook ?? map.render.landlook ?? (map.levelType === "land" ? 0 : -1);
  const currentLandlookSupported = STANDARD_LANDLOOK_OPTIONS.some((option) => option.value === currentLandlook);
  return (
    <div className="map-level-settings">
      {map.levelType === "dungeon" ? (
        <label className="map-select-field">
          <span>Renderer</span>
          <select value="-1" disabled>
            <option value="-1">Dungeon top-down (-1)</option>
          </select>
        </label>
      ) : (
        <label className="map-select-field">
          <span>Landlook</span>
          <select value={String(currentLandlook)} onChange={(event) => commit({ landlook: Number(event.currentTarget.value) })}>
            {!currentLandlookSupported && <option value={String(currentLandlook)}>Unsupported landlook {currentLandlook}</option>}
            {STANDARD_LANDLOOK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
      <div className="map-flag-row">
        <label className="map-check-field">
          <input type="checkbox" checked={Boolean(randomLevel?.isDark)} onChange={(event) => commit({ isDark: event.currentTarget.checked })} />
          <span>Dark level</span>
        </label>
        <label className="map-check-field">
          <input type="checkbox" checked={Boolean(randomLevel?.useLos)} onChange={(event) => commit({ useLos: event.currentTarget.checked })} />
          <span>Line of sight</span>
        </label>
      </div>
      {applied && <small className="map-applied-status">{applied}</small>}
      {atlasMissing && <div className="map-diagnostic-list"><span>Landlook atlas is unavailable; map rendering will fall back to colors.</span></div>}
      <div className="map-preview-controls">
        <label className="context-field compact">
          <span>Editor Preview</span>
          <select value={previewMode} onChange={(event) => onSetPreviewMode(event.currentTarget.value as MapPreviewMode)}>
            <option value="off">Off</option>
            <option value="los">LOS preview</option>
            <option value="darkness">Darkness preview</option>
            <option value="both">Both</option>
          </select>
        </label>
        <div className="map-setup-focus-row">
          <MapNumberField label="Focus X" value={previewFocalPoint.x} min={0} max={89} compact plain maxLength={2} onCommit={(x) => onSetPreviewFocalPoint({ ...previewFocalPoint, x })} />
          <MapNumberField label="Focus Y" value={previewFocalPoint.y} min={0} max={89} compact plain maxLength={2} onCommit={(y) => onSetPreviewFocalPoint({ ...previewFocalPoint, y })} />
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetPreviewFocalPoint(null)}>
            Use Current
          </button>
        </div>
      </div>
    </div>
  );
}
