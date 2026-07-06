import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AtlasEntry, IconEntry, MapEntity, MapMarker, MapRecord, MapViewFlag, MapViewOptions, MapWorkbenchMode, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../../types";
import { drawTileValueCell } from "../../map/drawMapCanvas";
import { tileValueAt } from "../../map/geometry";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../../utils";
import { InfoGrid } from "../InfoGrid";
import { TutorialTip } from "../TutorialTip";
import { MapDiagnostics, MapNumberField } from "./MapFormControls";

const MAP_RECORD_CANVAS_HELP =
  "Show Player Map starts and markers on the canvas without changing the maps.";
const MAP_RECORD_OPEN_HELP =
  "Open the land or dungeon map targeted by this player map.";
const MAP_RECORD_COPY_HELP =
  "Copy this player map's start coordinate as x,y.";
const MAP_RECORD_EDITOR_HELP =
  "Edit the map name, target view, note, markers, and display settings players see from Maps/Notes.";
const MAP_RECORD_START_HELP =
  "Top Left X/Y choose the upper-left map tile shown in this player map.";
const MAP_RECORD_LEVEL_HELP =
  "Level plus Dungeon map chooses the target Realmz land or dungeon level.";
const MAP_RECORD_PICT_HELP =
  "Picture ID chooses an image to show instead of a terrain crop. Zero or blank means no picture.";
const MAP_RECORD_ICON_SIZE_HELP =
  "Tile/Icon Size controls the terrain crop scale. Icon 137 is the classic large map marker.";
const MAP_RECORD_SHOW_HELP =
  "Show / Text ID controls the display mode. Negative values can point to scrolling text.";
const MAP_RECORD_DUNGEON_HELP =
  "Dungeon map toggles whether the target level is read as dungeon or land. This must agree with the level index you intend to target.";
const MAP_RECORD_NOTE_HELP =
  "The note is shown with this player map.";
const MAP_RECORD_MARKERS_HELP =
  "Player maps can carry up to ten icon markers. Marker icon IDs and x/y coordinates are separate from Action Points and random rectangles.";
const MAP_RECORD_MARKER_FIELD_HELP =
  "Marker fields store an icon ID plus x/y position within this player map preview. Set all three values to zero when a marker slot should be inactive.";
const MAP_RECORD_RECT_HELP =
  "The display rectangle controls how picture-backed maps are drawn. Keep bounds ordered.";

export function MapRecordsWorkbench({
  project,
  selectedMap,
  selectedEntity,
  mapRecords,
  onSelectEntity,
  onSetWorkbenchMode,
  onSetViewFlag,
  onOpenRelatedMap,
  atlasEntries,
  icons,
  filterToSelectedMap = true,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedEntity?: SelectedEntity | null;
  mapRecords: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetWorkbenchMode?: (mode: MapWorkbenchMode) => void;
  onSetViewFlag?: (flag: MapViewFlag, value: boolean) => void;
  onOpenRelatedMap?: (record: MapRecord) => void;
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  filterToSelectedMap?: boolean;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const records = project?.mapRecords ?? [];
  const visibleRecords = filterToSelectedMap && selectedMap
    ? records.filter((record) => record.level === selectedMap.index && record.isDungeon === (selectedMap.levelType === "dungeon"))
    : records;
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(() => visibleRecords[0]?.id ?? null);
  const visibleRecordKey = visibleRecords.map((record) => record.id).join(",");
  const selectedEntityRecordId = selectedEntity?.id.match(/^map-record:(-?\d+)$/)?.[1];
  useEffect(() => {
    if (!visibleRecords.some((record) => record.id === selectedRecordId)) setSelectedRecordId(visibleRecords[0]?.id ?? null);
  }, [selectedMap?.id, selectedRecordId, visibleRecordKey]);
  useEffect(() => {
    if (selectedEntityRecordId == null) return;
    const id = Number(selectedEntityRecordId);
    if (visibleRecords.some((record) => record.id === id)) setSelectedRecordId(id);
  }, [selectedEntityRecordId, visibleRecordKey]);
  const selectedRecord = visibleRecords.find((record) => record.id === selectedRecordId) ?? null;
  const selectedSemantic = selectedRecord ? mapRecords.find((record) => summaryNumber(record, "id") === selectedRecord.id) ?? semanticForMapRecord(selectedRecord) : null;
  const mapViewRecords = visibleRecords.filter((record) => playerMapRecordDisplayKind(record) !== "scrolling-text");
  const scrollingTextRecords = visibleRecords.filter((record) => playerMapRecordDisplayKind(record) === "scrolling-text");
  if (!project) return <p className="empty-copy compact">Open a project to browse player maps.</p>;
  return (
    <div className="map-records-workbench">
      {onSetWorkbenchMode && onSetViewFlag && (
        <div className="map-records-toolbar">
          <TutorialTip title="Show Player Maps On Canvas" body={MAP_RECORD_CANVAS_HELP} side="below">
            <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
              onSetWorkbenchMode("canvas");
              onSetViewFlag("showMapRecords", true);
            }}>
              Show On Canvas
            </button>
          </TutorialTip>
        </div>
      )}
      <div className="map-records-layout">
        <div className="map-records-table" role="list" aria-label="Player maps">
          <PlayerMapRecordListGroup
            title="Map Views"
            records={mapViewRecords}
            selectedRecordId={selectedRecordId}
            onSelect={setSelectedRecordId}
          />
          <PlayerMapRecordListGroup
            title="Scrolling Text Entries"
            records={scrollingTextRecords}
            selectedRecordId={selectedRecordId}
            onSelect={setSelectedRecordId}
          />
          {visibleRecords.length === 0 && <span className="empty-inline">No player maps point to the current map.</span>}
        </div>
        <div className="map-record-detail">
          {selectedRecord && selectedSemantic ? (
            <RecordSelectionDetails
              project={project}
              map={selectedMap}
              record={selectedSemantic}
              atlasEntries={atlasEntries}
              icons={icons}
              onOpenRelatedMap={onOpenRelatedMap}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <p className="empty-copy compact">Select a player map to edit it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerMapRecordListGroup({
  title,
  records,
  selectedRecordId,
  onSelect
}: {
  title: string;
  records: MapRecord[];
  selectedRecordId: number | null;
  onSelect: (id: number) => void;
}) {
  if (records.length === 0) return null;
  return (
    <section className="map-record-list-group">
      <span className="map-record-list-title">{title}</span>
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={record.id === selectedRecordId ? "selected" : ""}
          onClick={() => onSelect(record.id)}
        >
          <strong className="player-map-slot-badge">Map {record.id}</strong>
          <span>
            <b>{record.primaryName || record.name || `Player Map ${record.id}`}</b>
            <small>{playerMapRecordListDescription(record)}</small>
          </span>
          <em className={`map-record-picture-badge ${playerMapRecordDisplayKind(record)}`}>
            {playerMapRecordBadge(record)}
          </em>
        </button>
      ))}
    </section>
  );
}

function semanticForMapRecord(record: MapRecord): SemanticEntity {
  return {
    id: `map-record:${record.id}`,
    type: "map record",
    label: record.primaryName || record.name || `Player Map ${record.id}`,
    editState: "editable",
    confidence: "confirmed",
    source: "Data MD2",
    recordRef: `record:Data MD2:${record.id}`,
    byteRange: record.provenance
      ? { start: record.provenance.byteOffset, endExclusive: record.provenance.byteOffset + record.provenance.byteLength, length: record.provenance.byteLength }
      : null,
    editable: true,
    summary: {
      id: record.id,
      name: record.primaryName || record.name || `Player Map ${record.id}`,
      startX: record.startX,
      startY: record.startY,
      level: record.level,
      pictId: record.pictId,
      iconSize: record.iconSize,
      show: record.show,
      isDungeon: record.isDungeon,
      rect: record.rect,
      note: record.note
    }
  };
}

export function RecordSelectionDetails({
  project,
  map,
  record,
  atlasEntries,
  icons,
  onOpenRelatedMap,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  map: MapEntity | null;
  record: SemanticEntity;
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  onOpenRelatedMap?: (record: MapRecord) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const links = linksFor(project, record.id);
  const mapRecord = mapRecordForSemantic(project, record);
  const sourceRows: [string, string][] = [
    ["Label", record.label],
    ["Type", record.type],
    ["Storage", record.source],
    ["Record", record.recordRef ?? "none"],
    ["Bytes", record.byteRange ? `${record.byteRange.start}..${record.byteRange.endExclusive} (${record.byteRange.length})` : "none"],
    ["Edit State", userFacingEditState(record.editState ?? (record.editable ? "editable" : "inspect-only"))],
    ["Status", userFacingConfidence(record.confidence)]
  ];
  const summaryRows = Object.entries(record.summary)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)
    .map(([key, value]) => [labelizeKey(key), compactValue(value)] as [string, string]);
  return (
    <div className="record-selection-details">
      {mapRecord && (
        <MapRecordEditor
          map={map}
          record={mapRecord}
          semanticRecord={record}
          project={project}
          atlasEntries={atlasEntries}
          icons={icons}
          onOpenRelatedMap={onOpenRelatedMap}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      <details className="context-section map-record-technical-details">
        <summary>
          <span>Technical Details</span>
          <b>{sourceRows.length + summaryRows.length + links.outgoing.length + links.incoming.length}</b>
        </summary>
        <div className="map-record-technical-body">
          <h4>Storage</h4>
          <InfoGrid rows={sourceRows} />
          {summaryRows.length > 0 && (
            <>
              <h4>Decoded Values</h4>
              <InfoGrid rows={summaryRows} />
            </>
          )}
          <RelatedLinkSection
            title="Outgoing Links"
            links={links.outgoing}
            direction="outgoing"
            project={project}
            onSelectEntity={onSelectEntity}
          />
          <RelatedLinkSection
            title="Incoming Links"
            links={links.incoming}
            direction="incoming"
            project={project}
            onSelectEntity={onSelectEntity}
          />
        </div>
      </details>
    </div>
  );
}

function MapRecordEditor({
  map,
  record,
  semanticRecord,
  project,
  atlasEntries,
  icons,
  onOpenRelatedMap,
  onSelectEntity,
  onApplyCommand
}: {
  map: MapEntity | null;
  record: MapRecord;
  semanticRecord: SemanticEntity;
  project: Project | null;
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  onOpenRelatedMap?: (record: MapRecord) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) => {
    onApplyCommand({ kind: "updateMapRecord", label: `Update map record ${record.id}`, id: record.id, changes });
  };
  const updateNames = (changes: Extract<ProjectCommand, { kind: "updateMapRecordNames" }>["changes"]) => {
    onApplyCommand({ kind: "updateMapRecordNames", label: `Update player map ${record.id} names`, id: record.id, changes });
  };
  const markers = mapRecordMarkers(record);
  const updateMarker = (slot: number, changes: Partial<MapMarker>) => {
    update({ markers: markers.map((marker, index) => (index === slot ? { ...marker, ...changes } : marker)) });
  };
  const targetMap = project?.maps.find((candidate) => candidate.levelType === (record.isDungeon ? "dungeon" : "land") && candidate.index === record.level) ?? null;
  const targetMapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
  const compactNumberProps = { compact: true, plain: true, maxLength: 5 } as const;
  return (
    <details className="context-section map-record-editor" open>
      <summary>
        <TutorialTip title="Edit Player Map" body={MAP_RECORD_EDITOR_HELP} side="below">
        <span>Edit Player Map</span>
        </TutorialTip>
        <b>Map Settings</b>
      </summary>
      <MapDiagnostics diagnostics={mapRecordDiagnostics(record, map ?? targetMap)} />
      <div className="player-map-visual-editor">
        <PlayerMapPreview
          project={project}
          record={record}
          markers={markers}
          atlasEntries={atlasEntries}
          icons={icons}
          onUpdateMarker={updateMarker}
        />
        <div className="player-map-settings-panel">
          <div className="player-map-name-fields">
            <label className="player-map-text-field player-map-name-field">
              <TutorialTip title="Primary Map Name" body="The name shown for this entry in the Maps/Notes menu." side="right">
                <span>Primary Name</span>
              </TutorialTip>
              <input value={record.primaryName ?? record.name ?? ""} maxLength={255} onChange={(event) => updateNames({ name: event.currentTarget.value, primaryName: event.currentTarget.value })} />
            </label>
            <label className="player-map-text-field player-map-name-field secondary">
              <TutorialTip title="Secondary Map Name" body="An alternate menu name for scenarios that use one." side="right">
                <span>Secondary Name</span>
              </TutorialTip>
              <input value={record.secondaryName ?? ""} maxLength={255} onChange={(event) => updateNames({ secondaryName: event.currentTarget.value })} />
            </label>
            <div className="player-map-name-actions">
              <TutorialTip title="Open Related Map" body={MAP_RECORD_OPEN_HELP} side="below">
                <button className="btn btn-primary btn-xs" type="button" onClick={() => {
                  onSelectEntity({ type: "map", id: `map:${targetMapId}` });
                  onOpenRelatedMap?.(record);
                }}>
                  Open Map
                </button>
              </TutorialTip>
              <TutorialTip title="Copy Coordinates" body={MAP_RECORD_COPY_HELP} side="below">
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => navigator.clipboard?.writeText(`${record.startX},${record.startY}`)}>
                  Copy XY
                </button>
              </TutorialTip>
            </div>
          </div>
          <div className="map-authoring-form player-map-compact-fields">
            <MapNumberField label="Top Left X" value={record.startX} min={0} max={89} help={MAP_RECORD_START_HELP} onCommit={(startX) => update({ startX })} {...compactNumberProps} />
            <MapNumberField label="Top Left Y" value={record.startY} min={0} max={89} help={MAP_RECORD_START_HELP} onCommit={(startY) => update({ startY })} {...compactNumberProps} />
            <MapNumberField label="Level" value={record.level} min={0} max={255} help={MAP_RECORD_LEVEL_HELP} onCommit={(level) => update({ level })} {...compactNumberProps} />
            <MapNumberField label="Picture ID" value={record.pictId} help={MAP_RECORD_PICT_HELP} onCommit={(pictId) => update({ pictId })} {...compactNumberProps} />
            <MapNumberField label="Tile/Icon Size" value={record.iconSize} help={MAP_RECORD_ICON_SIZE_HELP} onCommit={(iconSize) => update({ iconSize })} {...compactNumberProps} />
            <MapNumberField label="Show / Text ID" value={record.show} help={MAP_RECORD_SHOW_HELP} onCommit={(show) => update({ show })} {...compactNumberProps} />
            <label className="map-check-field player-map-dungeon-toggle">
              <input type="checkbox" checked={record.isDungeon} onChange={(event) => update({ isDungeon: event.currentTarget.checked })} />
              <TutorialTip title="Dungeon Map" body={MAP_RECORD_DUNGEON_HELP} side="right">
                <span>Dungeon map</span>
              </TutorialTip>
            </label>
          </div>
          <label className="player-map-text-field player-map-note-field">
            <TutorialTip title="Map Note" body={MAP_RECORD_NOTE_HELP} side="right">
              <span>Note</span>
            </TutorialTip>
            <textarea value={record.note} maxLength={255} onChange={(event) => update({ note: event.currentTarget.value })} />
          </label>
        </div>
      </div>
      <details className="context-section">
        <summary>
          <TutorialTip title="Map Markers" body={MAP_RECORD_MARKERS_HELP} side="below">
            <span>Markers</span>
          </TutorialTip>
          <b>{activeMarkerCount(record)}/10</b>
        </summary>
        <div className="map-authoring-form">
          {markers.map((marker, slot) => (
            <div className="map-door-pair" key={slot}>
              <MapNumberField label={`M${slot + 1} Icon`} value={marker.iconId} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(iconId) => updateMarker(slot, { iconId })} {...compactNumberProps} />
              <MapNumberField label={`M${slot + 1} X`} value={marker.x} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(x) => updateMarker(slot, { x })} {...compactNumberProps} />
              <MapNumberField label={`M${slot + 1} Y`} value={marker.y} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(y) => updateMarker(slot, { y })} {...compactNumberProps} />
            </div>
          ))}
        </div>
      </details>
      <details className="context-section">
        <summary>
          <TutorialTip title="Display Rectangle" body={MAP_RECORD_RECT_HELP} side="below">
            <span>Display Rect</span>
          </TutorialTip>
          <b>{record.rect.left},{record.rect.top}</b>
        </summary>
        <div className="map-authoring-form">
          <MapNumberField label="Top" value={record.rect.top} help={MAP_RECORD_RECT_HELP} onCommit={(top) => update({ rect: { ...record.rect, top } })} {...compactNumberProps} />
          <MapNumberField label="Left" value={record.rect.left} help={MAP_RECORD_RECT_HELP} onCommit={(left) => update({ rect: { ...record.rect, left } })} {...compactNumberProps} />
          <MapNumberField label="Bottom" value={record.rect.bottom} help={MAP_RECORD_RECT_HELP} onCommit={(bottom) => update({ rect: { ...record.rect, bottom } })} {...compactNumberProps} />
          <MapNumberField label="Right" value={record.rect.right} help={MAP_RECORD_RECT_HELP} onCommit={(right) => update({ rect: { ...record.rect, right } })} {...compactNumberProps} />
        </div>
      </details>
    </details>
  );
}

// Modern Realmz renders Player Maps into lookrect: 320+leftshift by 320+downshift, with screensize=1.
const PLAYER_MAP_PREVIEW_WIDTH = 480;
const PLAYER_MAP_PREVIEW_HEIGHT = 416;
const PLAYER_MAP_PREVIEW_VIEW_OPTIONS: MapViewOptions = {
  showRealTiles: true,
  showDecodedColors: true,
  showRealmzCoordinates: false,
  showTriggers: false,
  showRandomRects: false,
  showMapRecords: false,
  showEncounterOverlays: false,
  showQuestOverlays: false,
  showMapOverlays: false,
  showBattleOverlays: false,
  showTextOverlays: false,
  showUnknownOverlays: false,
  showSecretOverlays: false
};

function PlayerMapPreview({
  project,
  record,
  markers,
  atlasEntries,
  icons,
  onUpdateMarker
}: {
  project: Project | null;
  record: MapRecord;
  markers: MapMarker[];
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  onUpdateMarker: (slot: number, changes: Partial<MapMarker>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeMarkerSlot, setActiveMarkerSlot] = useState(0);
  const [placingMarker, setPlacingMarker] = useState(false);
  const targetMap = project?.maps.find((candidate) => candidate.levelType === (record.isDungeon ? "dungeon" : "land") && candidate.index === record.level) ?? null;
  const picture = record.pictId !== 0
    ? project?.assetCatalog.pictures?.find((candidate) => candidate.resourceId === record.pictId) ?? null
    : null;
  const scrollingTextId = record.pictId === 0 && record.show < 0 ? record.show : null;
  const atlas = targetMap ? atlasEntries?.[targetMap.render.tilesetId] ?? null : null;
  const iconEntries = icons ?? {};
  const tileSize = normalizedPreviewTileSize(record.iconSize);
  const markersKey = markers.map((marker) => `${marker.iconId}:${marker.x}:${marker.y}`).join("|");

  useEffect(() => {
    if (!targetMap || picture?.previewPath || scrollingTextId !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PLAYER_MAP_PREVIEW_WIDTH, PLAYER_MAP_PREVIEW_HEIGHT);
    ctx.fillStyle = "#0d1319";
    ctx.fillRect(0, 0, PLAYER_MAP_PREVIEW_WIDTH, PLAYER_MAP_PREVIEW_HEIGHT);
    const columns = Math.ceil(PLAYER_MAP_PREVIEW_WIDTH / tileSize);
    const rows = Math.ceil(PLAYER_MAP_PREVIEW_HEIGHT / tileSize);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const mapX = record.startX + x;
        const mapY = record.startY + y;
        if (mapX < 0 || mapY < 0 || mapX >= targetMap.width || mapY >= targetMap.height) {
          ctx.fillStyle = "#070a0e";
          ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
          continue;
        }
        drawTileValueCell(ctx, {
          tile: tileValueAt(targetMap, mapX, mapY),
          x,
          y,
          atlas,
          icons: iconEntries,
          viewOptions: PLAYER_MAP_PREVIEW_VIEW_OPTIONS,
          cell: tileSize
        });
      }
    }
    drawPlayerMapMarkers(ctx, markers, iconEntries, tileSize);
    ctx.strokeStyle = "#d4c790";
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, PLAYER_MAP_PREVIEW_WIDTH - 1, PLAYER_MAP_PREVIEW_HEIGHT - 1);
  }, [atlas, iconEntries, markersKey, picture?.previewPath, record.startX, record.startY, scrollingTextId, targetMap, tileSize]);

  const handlePreviewClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!placingMarker || !targetMap || picture?.previewPath || scrollingTextId !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = PLAYER_MAP_PREVIEW_WIDTH / bounds.width;
    const scaleY = PLAYER_MAP_PREVIEW_HEIGHT / bounds.height;
    const x = Math.floor(((event.clientX - bounds.left) * scaleX) / tileSize);
    const y = Math.floor(((event.clientY - bounds.top) * scaleY) / tileSize);
    const maxX = Math.max(0, Math.ceil(PLAYER_MAP_PREVIEW_WIDTH / tileSize) - 1);
    const maxY = Math.max(0, Math.ceil(PLAYER_MAP_PREVIEW_HEIGHT / tileSize) - 1);
    const marker = markers[activeMarkerSlot] ?? { iconId: 0, x: 0, y: 0 };
    onUpdateMarker(activeMarkerSlot, {
      iconId: marker.iconId || 137,
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y))
    });
  };

  return (
    <section className="player-map-preview-card">
      <header>
        <div>
          <strong>{scrollingTextId !== null ? "Scrolling text map" : picture?.previewPath ? "Picture preview" : "Terrain preview"}</strong>
          <span>{scrollingTextId !== null ? `Scrolling Text ${scrollingTextId}` : targetMap ? `${targetMap.name} from ${record.startX},${record.startY}` : picture ? `Picture ${record.pictId}` : "Target map or picture is missing"}</span>
        </div>
        <div className="player-map-marker-tools">
          <label>
            <span>Marker</span>
            <select value={activeMarkerSlot} onChange={(event) => setActiveMarkerSlot(Number(event.currentTarget.value))}>
              {markers.map((_, slot) => <option key={slot} value={slot}>{slot + 1}</option>)}
            </select>
          </label>
          <button className={`btn btn-xs ${placingMarker ? "btn-primary" : "btn-secondary"}`} type="button" disabled={!targetMap || Boolean(picture?.previewPath) || scrollingTextId !== null} onClick={() => setPlacingMarker((value) => !value)}>
            Place
          </button>
        </div>
      </header>
      {scrollingTextId !== null ? (
        <div className="player-map-scrolling-preview">
          <strong>Scrolling Text {scrollingTextId}</strong>
          <span>Edit the text body in Strings.</span>
        </div>
      ) : picture?.previewPath ? (
        <div className="player-map-picture-preview">
          <img src={picture.previewPath} alt={`PICT ${record.pictId}`} />
          <span>Display rect {record.rect.left},{record.rect.top} to {record.rect.right},{record.rect.bottom}</span>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={PLAYER_MAP_PREVIEW_WIDTH}
          height={PLAYER_MAP_PREVIEW_HEIGHT}
          onClick={handlePreviewClick}
          className={placingMarker ? "placing-marker" : ""}
          aria-label="Player map terrain preview"
        />
      )}
    </section>
  );
}

function normalizedPreviewTileSize(value: number) {
  if (value === 8 || value === 16 || value === 32) return value;
  if (value > 0 && value < 64) return Math.max(4, Math.min(32, Math.trunc(value)));
  return 8;
}

function drawPlayerMapMarkers(
  ctx: CanvasRenderingContext2D,
  markers: MapMarker[],
  icons: Record<number, IconEntry>,
  tileSize: number
) {
  for (const marker of markers) {
    if (marker.iconId === 0 && marker.x === 0 && marker.y === 0) continue;
    const localX = marker.x;
    const localY = marker.y;
    if (localX < 0 || localY < 0) continue;
    const absIcon = Math.abs(marker.iconId);
    const entry = icons[marker.iconId] ?? icons[absIcon] ?? null;
    const fullSizeMarker = absIcon === 137 || absIcon === 139;
    const size = fullSizeMarker ? 32 : tileSize;
    const inset = fullSizeMarker ? (size - tileSize) / 2 : 0;
    const left = localX * tileSize - inset;
    const top = localY * tileSize - inset;
    if (left >= PLAYER_MAP_PREVIEW_WIDTH || top >= PLAYER_MAP_PREVIEW_HEIGHT || left + size <= 0 || top + size <= 0) continue;
    if (entry?.image?.complete) {
      ctx.drawImage(entry.image, left, top, size, size);
    } else {
      drawFallbackPlayerMapMarker(ctx, absIcon, left, top, size);
    }
  }
}

function drawFallbackPlayerMapMarker(ctx: CanvasRenderingContext2D, iconId: number, left: number, top: number, size: number) {
  if (iconId === 137) {
    ctx.save();
    ctx.strokeStyle = "#ffcc4d";
    ctx.lineWidth = Math.max(3, Math.round(size / 8));
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(left + size * 0.25, top + size * 0.22);
    ctx.lineTo(left + size * 0.78, top + size * 0.78);
    ctx.moveTo(left + size * 0.78, top + size * 0.22);
    ctx.lineTo(left + size * 0.25, top + size * 0.78);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (iconId === 139) {
    ctx.save();
    ctx.fillStyle = "#ffcc4d";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.lineWidth = 3;
    ctx.font = `900 ${Math.max(18, Math.round(size * 0.76))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText("S", left + size / 2, top + size / 2);
    ctx.fillText("S", left + size / 2, top + size / 2);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#ffd47a";
  ctx.strokeStyle = "#1d2530";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(left + size / 2, top + size / 2, Math.max(4, size * 0.35), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1d2530";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(iconId), left + size / 2, top + size / 2);
}

function mapRecordMarkers(record: MapRecord): MapMarker[] {
  return Array.from({ length: 10 }, (_, slot) => {
    const marker = record.markers?.[slot];
    if (marker) return marker;
    const offset = slot * 6;
    if (!record.rawBytes || record.rawBytes.length < offset + 6) return { iconId: 0, x: 0, y: 0 };
    return {
      iconId: readI16(record.rawBytes, offset),
      x: readI16(record.rawBytes, offset + 2),
      y: readI16(record.rawBytes, offset + 4)
    };
  });
}

function activeMarkerCount(record: MapRecord) {
  return mapRecordMarkers(record).filter((marker) => marker.iconId !== 0 || marker.x !== 0 || marker.y !== 0).length;
}

function playerMapRecordDisplayKind(record: MapRecord) {
  if (record.pictId === 0 && record.show < 0) return "scrolling-text";
  if (record.pictId !== 0) return "picture";
  return "terrain";
}

function playerMapRecordListDescription(record: MapRecord) {
  const target = `${record.isDungeon ? "Dungeon" : "Land"} ${record.level} at ${record.startX},${record.startY}`;
  if (playerMapRecordDisplayKind(record) === "scrolling-text") return `Scrolling Text ${record.show} from ${target}`;
  if (record.pictId !== 0) return `Picture-backed entry from ${target}`;
  return target;
}

function playerMapRecordBadge(record: MapRecord) {
  if (playerMapRecordDisplayKind(record) === "scrolling-text") return <>TEXT<br />{record.show}</>;
  if (record.pictId !== 0) return <>PICT<br />{record.pictId}</>;
  return <>MAP<br />VIEW</>;
}

function readI16(bytes: number[], offset: number) {
  const unsigned = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function mapRecordForSemantic(project: Project | null, record: SemanticEntity) {
  if (record.type !== "map record") return null;
  const id = summaryNumber(record, "id") ?? Number(record.id.replace(/^map-record:/, ""));
  if (!Number.isInteger(id)) return null;
  return (project?.mapRecords ?? []).find((candidate) => candidate.id === id) ?? null;
}

function mapRecordDiagnostics(record: MapRecord, map: MapEntity | null) {
  const diagnostics: string[] = [];
  if (record.startX < 0 || record.startX >= 90 || record.startY < 0 || record.startY >= 90) {
    diagnostics.push("Start coordinate is outside the 90x90 map.");
  }
  if (record.rect.left > record.rect.right || record.rect.top > record.rect.bottom) {
    diagnostics.push("Display rectangle is inverted.");
  }
  if (map && (record.isDungeon !== (map.levelType === "dungeon") || record.level !== map.index)) {
    diagnostics.push(`This player map points to ${record.isDungeon ? "dungeon" : "land"} ${record.level}, not the current map.`);
  }
  if (record.show < 0 && record.pictId === 0) {
    diagnostics.push(`This player map opens Scrolling Text ${record.show}; edit the text in Strings.`);
  }
  return diagnostics;
}

function RelatedLinkSection({
  title,
  links,
  direction,
  project,
  onSelectEntity
}: {
  title: string;
  links: ReturnType<typeof linksFor>["outgoing"];
  direction: "outgoing" | "incoming";
  project: Project | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <details className="context-section" open={links.length > 0}>
      <summary>
        <span>{title}</span>
        <b>{links.length}</b>
      </summary>
      <div className="selection-link-list">
        {links.slice(0, 24).map((link) => {
          const id = direction === "outgoing" ? link.to : link.from;
          return (
            <button key={link.id} className="link-chip related" onClick={() => onSelectEntity(selectEntityFromId(id))}>
              <span>{link.kind.replace(/_/g, " ")}</span>
              <b>{semanticLabel(project, id)}</b>
            </button>
          );
        })}
        {links.length === 0 && <span className="empty-inline">No related records resolved.</span>}
      </div>
    </details>
  );
}

function labelizeKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}


function summaryNumber(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : null;
}

function userFacingEditState(state: string | null | undefined) {
  if (!state) return "inspect-only";
  if (state === "editable") return "editable";
  if (state === "inspect-only") return "inspect-only";
  if (state === "preserve-only") return "preserved";
  return state.replace(/-/g, " ");
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (!confidence) return "unknown";
  if (confidence === "source-backed") return "loaded from scenario";
  if (confidence === "confirmed") return "verified";
  if (confidence === "preserved") return "preserved";
  if (confidence === "needs-runtime-trace") return "needs playtest";
  return confidence.replace(/-/g, " ");
}
