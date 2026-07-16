import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AtlasEntry, IconEntry, MapEntity, MapMarker, MapRecord, MapViewFlag, MapViewOptions, MapWorkbenchMode, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../../types";
import { drawTileValueCell } from "../../map/drawMapCanvas";
import { tileValueAt } from "../../map/geometry";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../../utils";
import { EmptyState, EntityRow, ScrollArea, SearchField, WorkbenchActionBar } from "../../ui";
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
const DEFAULT_PLAYER_MAP_MARKER_ICON_IDS = [137, 139] as const;

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
  onOpenTool,
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
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const records = project?.mapRecords ?? [];
  const visibleRecords = filterToSelectedMap && selectedMap
    ? records.filter((record) => record.level === selectedMap.index && record.isDungeon === (selectedMap.levelType === "dungeon"))
    : records;
  const [query, setQuery] = useState("");
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
  const filteredRecords = filterPlayerMapRecords(visibleRecords, query);
  const mapViewRecords = filteredRecords.filter((record) => playerMapRecordDisplayKind(record) !== "scrolling-text");
  const scrollingTextRecords = filteredRecords.filter((record) => playerMapRecordDisplayKind(record) === "scrolling-text");
  const createRecord = () => {
    const id = nextMapRecordId(records);
    onApplyCommand({
      kind: "createMapRecord",
      label: `Create Player Map ${id}`,
      id,
      template: selectedMap
        ? { level: selectedMap.index, isDungeon: selectedMap.levelType === "dungeon" }
        : undefined
    });
    setSelectedRecordId(id);
    onSelectEntity(selectEntityFromId(`map-record:${id}`));
  };
  if (!project) return <p className="empty-copy compact">Open a project to browse player maps.</p>;
  return (
    <div className="map-records-workbench">
      <WorkbenchActionBar
        className="player-map-action-bar"
        ariaLabel="Player map actions"
        meta={`${filteredRecords.length.toLocaleString()} of ${visibleRecords.length.toLocaleString()} player maps`}
      >
        <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={createRecord}>
          New Player Map
        </button>
        {onSetWorkbenchMode && onSetViewFlag && (
          <TutorialTip title="Show Player Maps On Canvas" body={MAP_RECORD_CANVAS_HELP} side="below">
            <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
              onSetWorkbenchMode("canvas");
              onSetViewFlag("showMapRecords", true);
            }}>
              Show On Canvas
            </button>
          </TutorialTip>
        )}
      </WorkbenchActionBar>
      <div className="map-records-layout">
        <div className="player-map-record-browser">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search player maps..."
            ariaLabel="Search player maps"
            resultCount={filteredRecords.length}
            resultNoun="player map"
          />
          <ScrollArea className="map-records-table" aria-label="Player maps">
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
            {filteredRecords.length === 0 && (
              <EmptyState
                compact
                title={query ? "No matching player maps" : "No player maps for this level"}
                body={query ? "Try a map name, slot, level, coordinate, picture, or text ID." : "Create a player map or choose a level with existing map entries."}
              />
            )}
          </ScrollArea>
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
              onOpenTool={onOpenTool}
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

function nextMapRecordId(records: MapRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 1000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
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
        <EntityRow
          key={record.id}
          className="player-map-record-row"
          selected={record.id === selectedRecordId}
          icon={<strong className="player-map-slot-badge">Map {record.id}</strong>}
          title={record.primaryName || record.name || `Player Map ${record.id}`}
          subtitle={playerMapRecordListDescription(record)}
          status={playerMapRecordBadge(record)}
          statusTone={playerMapRecordDisplayKind(record) === "scrolling-text" ? "warning" : "info"}
          onSelect={() => onSelect(record.id)}
        />
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
  onOpenTool,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  map: MapEntity | null;
  record: SemanticEntity;
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  onOpenRelatedMap?: (record: MapRecord) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
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
          onOpenTool={onOpenTool}
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
  onOpenTool,
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
  onOpenTool?: (tab: "text", editor: string) => void;
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
  const clearMarker = (slot: number) => {
    updateMarker(slot, { iconId: 0, x: 0, y: 0 });
  };
  const isScrollingTextMap = playerMapRecordDisplayKind(record) === "scrolling-text";
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
          onClearMarker={clearMarker}
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
              {isScrollingTextMap ? (
                <button className="btn btn-primary btn-xs" type="button" onClick={() => {
                  onSelectEntity(selectEntityFromId(`resource:TEXT:${record.show}`));
                  onOpenTool?.("text", "text-resources");
                }}>
                  Edit Text in Strings
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
          {isScrollingTextMap ? (
            <div className="map-authoring-form player-map-compact-fields player-map-text-reference-fields">
              <MapNumberField label="Show / Text ID" value={record.show} help={MAP_RECORD_SHOW_HELP} onCommit={(show) => update({ show })} {...compactNumberProps} />
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
      {!isScrollingTextMap && (
        <>
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
        </>
      )}
    </details>
  );
}

// Current Realmz Castle main still shows Maps/Notes helper maps in the classic 320x320 map window.
const PLAYER_MAP_PREVIEW_WIDTH = 320;
const PLAYER_MAP_PREVIEW_HEIGHT = 320;
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
  showSecretOverlays: false,
  showCombatClearingOverlays: false
};

function PlayerMapPreview({
  project,
  record,
  markers,
  atlasEntries,
  icons,
  onUpdateMarker,
  onClearMarker
}: {
  project: Project | null;
  record: MapRecord;
  markers: MapMarker[];
  atlasEntries?: Record<string, AtlasEntry>;
  icons?: Record<number, IconEntry>;
  onUpdateMarker: (slot: number, changes: Partial<MapMarker>) => void;
  onClearMarker: (slot: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeMarkerSlot, setActiveMarkerSlot] = useState(0);
  const [placingMarker, setPlacingMarker] = useState(false);
  const [placeIconId, setPlaceIconId] = useState(137);
  const targetMap = project?.maps.find((candidate) => candidate.levelType === (record.isDungeon ? "dungeon" : "land") && candidate.index === record.level) ?? null;
  const picture = record.pictId !== 0
    ? project?.assetCatalog.pictures?.find((candidate) => candidate.resourceId === record.pictId) ?? null
    : null;
  const scrollingTextId = record.pictId === 0 && record.show < 0 ? record.show : null;
  const atlas = targetMap ? atlasEntries?.[targetMap.render.tilesetId] ?? null : null;
  const iconEntries = icons ?? {};
  const tileSize = normalizedPreviewTileSize(record.iconSize);
  const markersKey = markers.map((marker) => `${marker.iconId}:${marker.x}:${marker.y}`).join("|");
  const activeMarkerIconId = markers[activeMarkerSlot]?.iconId ?? 0;
  const placeIconEntry = iconEntries[placeIconId] ?? iconEntries[Math.abs(placeIconId)] ?? null;
  const iconOptions = useMemo(() => playerMapIconOptionIds(project, placeIconId), [placeIconId, project]);
  const iconDatalistId = `player-map-icon-options-${record.id}`;
  const activeMarkerCount = markers.filter(isActiveMarker).length;

  useEffect(() => {
    if (activeMarkerIconId !== 0) setPlaceIconId(activeMarkerIconId);
  }, [activeMarkerIconId, activeMarkerSlot]);

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
    onUpdateMarker(activeMarkerSlot, {
      iconId: clampSignedInt16(placeIconId),
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y))
    });
  };

  return (
    <section className="player-map-preview-card">
      <header>
        <strong>{scrollingTextId !== null ? "Scrolling text map" : picture?.previewPath ? "Picture preview" : "Terrain preview"}</strong>
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
      {scrollingTextId === null && (
        <div className="player-map-marker-tools">
          <label>
            <span>Marker</span>
            <select value={activeMarkerSlot} onChange={(event) => setActiveMarkerSlot(Number(event.currentTarget.value))}>
              {markers.map((_, slot) => <option key={slot} value={slot}>{slot + 1}</option>)}
            </select>
          </label>
          <div className="player-map-place-icon-control">
            <div className="player-map-place-icon-stepper">
              <button className="btn btn-xs btn-secondary" type="button" aria-label="Previous icon ID" onClick={() => setPlaceIconId((value) => clampSignedInt16(value - 1))}>
                -
              </button>
              <MapNumberField
                label="Icon ID"
                value={placeIconId}
                help="Choose the icon resource written into the selected marker slot when you place it on the preview."
                onCommit={(iconId) => setPlaceIconId(clampSignedInt16(iconId))}
                commitOnChange
                compact
                plain
                maxLength={6}
                list={iconDatalistId}
              />
              <button className="btn btn-xs btn-secondary" type="button" aria-label="Next icon ID" onClick={() => setPlaceIconId((value) => clampSignedInt16(value + 1))}>
                +
              </button>
            </div>
            <span className="player-map-place-icon-preview" title={`Icon ${placeIconId}`}>
              {placeIconEntry?.url ? <img src={placeIconEntry.url} alt="" /> : <span>{placeIconId}</span>}
            </span>
            <datalist id={iconDatalistId}>
              {iconOptions.map((option) => (
                <option key={option.id} value={option.id} label={option.label} />
              ))}
            </datalist>
          </div>
          <button className={`btn btn-xs ${placingMarker ? "btn-primary" : "btn-secondary"}`} type="button" disabled={!targetMap || Boolean(picture?.previewPath)} onClick={() => setPlacingMarker((value) => !value)}>
            Place
          </button>
          <button className="btn btn-xs btn-secondary" type="button" disabled={!isActiveMarker(markers[activeMarkerSlot])} onClick={() => onClearMarker(activeMarkerSlot)}>
            Delete
          </button>
        </div>
      )}
      {scrollingTextId === null && (
        <details className="player-map-marker-details">
          <summary>
            <TutorialTip title="Map Markers" body={MAP_RECORD_MARKERS_HELP} side="below">
              <span>Markers</span>
            </TutorialTip>
            <b>{activeMarkerCount}/10</b>
          </summary>
          <div className="player-map-marker-list">
            {markers.map((marker, slot) => {
              const markerIconEntry = iconEntries[marker.iconId] ?? iconEntries[Math.abs(marker.iconId)] ?? null;
              return (
                <div className={`player-map-marker-row${slot === activeMarkerSlot ? " selected" : ""}`} key={slot}>
                  <button className="btn btn-xs btn-secondary player-map-marker-slot-button" type="button" onClick={() => setActiveMarkerSlot(slot)}>
                    M{slot + 1}
                  </button>
                  <span className="player-map-marker-row-preview" title={marker.iconId === 0 ? "No marker" : `Icon ${marker.iconId}`}>
                    {markerIconEntry?.url ? <img src={markerIconEntry.url} alt="" /> : <span>{marker.iconId === 0 ? "-" : marker.iconId}</span>}
                  </span>
                  <MapNumberField label="Icon" value={marker.iconId} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(iconId) => onUpdateMarker(slot, { iconId })} commitOnChange compact plain maxLength={6} />
                  <MapNumberField label="X" value={marker.x} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(x) => onUpdateMarker(slot, { x })} commitOnChange compact plain maxLength={5} />
                  <MapNumberField label="Y" value={marker.y} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(y) => onUpdateMarker(slot, { y })} commitOnChange compact plain maxLength={5} />
                  <button className="btn btn-xs btn-danger" type="button" disabled={!isActiveMarker(marker)} onClick={() => onClearMarker(slot)} aria-label={`Delete marker ${slot + 1}`}>
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function normalizedPreviewTileSize(value: number) {
  if (value === 8 || value === 16 || value === 32) return value;
  if (value > 0 && value < 64) return Math.max(4, Math.min(32, Math.trunc(value)));
  return 8;
}

function playerMapIconOptionIds(project: Project | null, currentIconId: number) {
  const byId = new Map<number, string>();
  for (const id of DEFAULT_PLAYER_MAP_MARKER_ICON_IDS) {
    byId.set(id, `Icon ${id}`);
  }
  for (const record of project?.mapRecords ?? []) {
    for (const marker of mapRecordMarkers(record)) {
      if (marker.iconId !== 0) byId.set(marker.iconId, `Icon ${marker.iconId}`);
    }
  }
  if (currentIconId !== 0) {
    byId.set(currentIconId, `Icon ${currentIconId}`);
  }
  return [...byId.entries()]
    .sort(([left], [right]) => left - right)
    .map(([id, label]) => ({ id, label }));
}

function isActiveMarker(marker: MapMarker | undefined) {
  return Boolean(marker && (marker.iconId !== 0 || marker.x !== 0 || marker.y !== 0));
}

function clampSignedInt16(value: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 137;
  return Math.max(-32768, Math.min(32767, numeric));
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
  if (playerMapRecordDisplayKind(record) === "scrolling-text") return `Opens Scrolling Text ${record.show}`;
  if (record.pictId !== 0) return `Picture-backed entry from ${target}`;
  return target;
}

export function filterPlayerMapRecords(records: MapRecord[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return records;
  return records.filter((record) => {
    const kind = playerMapRecordDisplayKind(record);
    const haystack = [
      `map ${record.id}`,
      record.primaryName,
      record.secondaryName,
      record.name,
      record.note,
      playerMapRecordListDescription(record),
      playerMapRecordBadge(record),
      kind.replace("-", " ")
    ].filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function playerMapRecordBadge(record: MapRecord) {
  if (playerMapRecordDisplayKind(record) === "scrolling-text") return `TEXT ${record.show}`;
  if (record.pictId !== 0) return `PICT ${record.pictId}`;
  return "Map view";
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
