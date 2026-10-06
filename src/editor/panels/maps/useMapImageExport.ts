import { useState } from "react";
import type { EditorState } from "../../store";
import type { MapEntity, MapPreviewFocalPoint, MapPreviewMode, TilesetAsset } from "../../types";
import {
  createScenarioMapArchive,
  mapExportFileName,
  nativeMapPixelSize,
  renderMapJpeg,
  scenarioMapArchiveFileName
} from "../../map/mapImageExport";
import { saveMapImageExport } from "../../map/saveMapImageExport";

export function useMapImageExport({
  state,
  selectedMap,
  selectedTileset,
  previewMode,
  previewFocalPoint
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const options = state.project ? {
    project: state.project,
    atlasEntries: state.atlasEntries,
    icons: state.iconEntries,
    viewOptions: state,
    smoothTiles: state.smoothTiles,
    selectedEntity: state.selectedEntity,
    visibleRandomRectIds: state.visibleRandomRectIds,
    visibleMapRecordIds: state.visibleMapRecordIds,
    previewMode,
    previewFocalPoint
  } : null;

  const exportCurrentMap = async () => {
    if (!options || !selectedMap) return;
    setBusy(true);
    setStatus("Rendering native JPG...");
    try {
      const jpeg = await renderMapJpeg(options, selectedMap, nativeMapPixelSize(selectedTileset));
      setStatus(await saveMapImageExport(jpeg, mapExportFileName(selectedMap), "jpg"));
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const exportAllMaps = async () => {
    if (!options) return;
    setBusy(true);
    setStatus(`Rendering 0/${options.project.maps.length} maps...`);
    try {
      const archive = await createScenarioMapArchive(options, state.zoom, ({ completed, total, map }) => {
        setStatus(`Rendering ${completed}/${total}: ${map.name}`);
      });
      setStatus(await saveMapImageExport(archive, scenarioMapArchiveFileName(options.project, state.zoom), "zip"));
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return { busy, status, exportCurrentMap, exportAllMaps };
}
