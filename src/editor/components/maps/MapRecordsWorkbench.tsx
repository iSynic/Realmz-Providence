import { useEffect, useState } from "react";
import { MapEntity, MapMarker, MapRecord, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../../utils";
import { InfoGrid } from "../InfoGrid";
import { TutorialTip } from "../TutorialTip";
import { MapDiagnostics, MapNumberField } from "./MapFormControls";

const MAP_RECORDS_HELP =
  "Maps Menu records are Realmz Data MD2 records. The Maps/Notes menu unlocks up to 20 entries, and each entry can display a tile map preview, a PICT-backed view, markers, or note text.";
const MAP_RECORD_FILTER_HELP =
  "When a map is selected, Providence shows Maps Menu records whose land/dungeon flag and level index point at that map. Switch maps or clear the selection to inspect other entries.";
const MAP_RECORD_CANVAS_HELP =
  "Show Maps Menu starts and markers on the canvas. This switches to Canvas mode with the map-record overlay enabled, without changing the records.";
const MAP_RECORD_ROW_HELP =
  "Select a Maps Menu record to inspect source evidence, editable fields, outgoing links, incoming references, and canvas navigation actions.";
const MAP_RECORD_SUMMARY_HELP =
  "This summary combines the record's display name, target level, start coordinate, PICT link, marker count, display rectangle, and note.";
const MAP_RECORD_OPEN_HELP =
  "Open the map targeted by this record and select the record overlay on the canvas. Useful for checking whether the start coordinate and markers line up visually.";
const MAP_RECORD_COPY_HELP =
  "Copy the record's start coordinate as x,y for cross-checking scripts, manual notes, or bug reports.";
const MAP_RECORD_DETAILS_HELP =
  "Semantic details show the decoded source record, byte range, confidence, and links so you can distinguish editable fields from preserved evidence.";
const MAP_RECORD_EDITOR_HELP =
  "Edit source-backed Data MD2 Maps Menu fields. Menu names come from STR# -102/-101 Map Names resources; unknown bytes stay preserved on export.";
const MAP_RECORD_START_HELP =
  "Start X and Start Y are the 0..89 map coordinates where Realmz places the party or cursor for this map record.";
const MAP_RECORD_LEVEL_HELP =
  "Level plus Dungeon record chooses the target Realmz land or dungeon level. Changing it can move this record away from the currently selected map.";
const MAP_RECORD_PICT_HELP =
  "Picture ID is the PICT resource Realmz can associate with this map record. Zero or blank means no picture link.";
const MAP_RECORD_ICON_SIZE_HELP =
  "Icon Size is an imported map-record display field. Keep it visible for compatibility and edit carefully unless the target behavior is known.";
const MAP_RECORD_SHOW_HELP =
  "Show is an imported display/control field from the map record. It is source-backed but still legacy-sensitive, so prefer conservative edits.";
const MAP_RECORD_DUNGEON_HELP =
  "Dungeon record toggles whether the target level is read as dungeon or land. This must agree with the level index you intend to target.";
const MAP_RECORD_NOTE_HELP =
  "The map-record note is a short source-backed annotation field. It can document author intent or legacy clues but is still limited to classic record storage.";
const MAP_RECORD_MARKERS_HELP =
  "Map records can carry up to ten icon markers. Marker icon IDs and x/y coordinates are separate from Action Points and random rectangles.";
const MAP_RECORD_MARKER_FIELD_HELP =
  "Marker fields store an icon ID plus x/y map coordinate. Set all three values to zero when a marker slot should be inactive.";
const MAP_RECORD_RECT_HELP =
  "The display rectangle is a source-backed map-record rectangle. Keep bounds ordered; inverted values will be reported by diagnostics.";
const MAP_RECORD_LINKS_HELP =
  "Outgoing and incoming links show how semantic records connect this map record to maps, pictures, scripts, text, or other project data.";

export function MapRecordsWorkbench({
  project,
  selectedMap,
  mapRecords,
  onSelectMap,
  onSelectEntity,
  onSetWorkbenchMode,
  onSetViewFlag,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  mapRecords: SemanticEntity[];
  onSelectMap: (id: string) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const records = project?.mapRecords ?? [];
  const visibleRecords = selectedMap
    ? records.filter((record) => record.level === selectedMap.index && record.isDungeon === (selectedMap.levelType === "dungeon"))
    : records;
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(() => visibleRecords[0]?.id ?? null);
  const visibleRecordKey = visibleRecords.map((record) => record.id).join(",");
  useEffect(() => {
    if (!visibleRecords.some((record) => record.id === selectedRecordId)) setSelectedRecordId(visibleRecords[0]?.id ?? null);
  }, [selectedMap?.id, selectedRecordId, visibleRecordKey]);
  const selectedRecord = visibleRecords.find((record) => record.id === selectedRecordId) ?? null;
  const selectedSemantic = selectedRecord ? mapRecords.find((record) => summaryNumber(record, "id") === selectedRecord.id) ?? semanticForMapRecord(selectedRecord) : null;
  if (!project) return <p className="empty-copy compact">Open a project to browse Maps Menu records.</p>;
  return (
    <div className="map-records-workbench">
      <p className="empty-copy compact">
        <TutorialTip title="Maps Menu" body={MAP_RECORDS_HELP} side="below">
          <span>Browse and edit source-backed Maps Menu records.</span>
        </TutorialTip>
      </p>
      <div className="map-records-toolbar">
        <InfoGrid
          rows={[
            ["Shown", visibleRecords.length],
            ["Total Records", records.length],
            ["Current Map", selectedMap?.name ?? "All maps"],
            ["Record Type", "Map settings"]
          ]}
        />
        <div className="context-action-stack compact">
          <TutorialTip title="Visible Maps Menu Records" body={MAP_RECORD_FILTER_HELP} side="below">
            <span className="map-help-anchor">Current Filter</span>
          </TutorialTip>
          <TutorialTip title="Show Maps Menu Records On Canvas" body={MAP_RECORD_CANVAS_HELP} side="below">
            <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
              onSetWorkbenchMode("canvas");
              onSetViewFlag("showMapRecords", true);
            }}>
              Show On Canvas
            </button>
          </TutorialTip>
        </div>
      </div>
      <div className="map-records-layout">
        <div className="map-records-table" role="list" aria-label="Maps Menu records">
          <TutorialTip title="Maps Menu Rows" body={MAP_RECORD_ROW_HELP} side="below">
            <span className="map-help-anchor map-record-list-help">Maps Menu Rows</span>
          </TutorialTip>
          {visibleRecords.map((record) => (
            <button
              key={record.id}
              type="button"
              className={record.id === selectedRecordId ? "selected" : ""}
              onClick={() => setSelectedRecordId(record.id)}
            >
              <span>
                <b>{record.primaryName || record.name || `Maps Menu ${record.id}`}</b>
                <small>{record.isDungeon ? "Dungeon" : "Land"} {record.level} at {record.startX},{record.startY}</small>
              </span>
              <em>PICT {record.pictId || "none"}</em>
            </button>
          ))}
          {visibleRecords.length === 0 && <span className="empty-inline">No Maps Menu records resolve to the current map.</span>}
        </div>
        <div className="map-record-detail">
          {selectedRecord && selectedSemantic ? (
            <>
              <div className="map-record-summary-card">
                <TutorialTip title="Maps Menu Summary" body={MAP_RECORD_SUMMARY_HELP} side="below">
                  <span className="map-help-anchor">Record Summary</span>
                </TutorialTip>
                <InfoGrid
                  rows={[
                    ["Name", selectedRecord.primaryName || selectedRecord.name || `Maps Menu ${selectedRecord.id}`],
                    ["Level", `${selectedRecord.isDungeon ? "Dungeon" : "Land"} ${selectedRecord.level}`],
                    ["Start", `${selectedRecord.startX}, ${selectedRecord.startY}`],
                    ["Picture", selectedRecord.pictId || "none"],
                    ["Show", selectedRecord.show],
                    ["Markers", `${activeMarkerCount(selectedRecord)}/10`],
                    ["Rect", `${selectedRecord.rect.left},${selectedRecord.rect.top} to ${selectedRecord.rect.right},${selectedRecord.rect.bottom}`],
                    ["Note", selectedRecord.note || "none"]
                  ]}
                />
                <div className="context-action-stack compact">
                  <TutorialTip title="Open Related Map" body={MAP_RECORD_OPEN_HELP} side="below">
                    <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
                      onSelectMap(`map:${selectedRecord.isDungeon ? "dungeon" : "land"}:${selectedRecord.level}`);
                      onSetWorkbenchMode("canvas");
                      onSetViewFlag("showMapRecords", true);
                      onSelectEntity(selectEntityFromId(`map-record:${selectedRecord.id}`));
                    }}>
                      Open Related Map
                    </button>
                  </TutorialTip>
                  <TutorialTip title="Copy Coordinates" body={MAP_RECORD_COPY_HELP} side="below">
                    <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => navigator.clipboard?.writeText(`${selectedRecord.startX},${selectedRecord.startY}`)}>
                      Copy Coordinates
                    </button>
                  </TutorialTip>
                </div>
              </div>
              <RecordSelectionDetails
                project={project}
                map={selectedMap}
                record={selectedSemantic}
                onSelectEntity={onSelectEntity}
                onApplyCommand={onApplyCommand}
              />
            </>
          ) : (
            <p className="empty-copy compact">Select a Maps Menu record to inspect or edit it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function semanticForMapRecord(record: MapRecord): SemanticEntity {
  return {
    id: `map-record:${record.id}`,
    type: "map record",
    label: record.primaryName || record.name || `Maps Menu ${record.id}`,
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
      name: record.primaryName || record.name || `Maps Menu ${record.id}`,
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  map: MapEntity | null;
  record: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const links = linksFor(project, record.id);
  const mapRecord = mapRecordForSemantic(project, record);
  const summaryRows = Object.entries(record.summary)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)
    .map(([key, value]) => [labelizeKey(key), compactValue(value)] as [string, string]);
  return (
    <div className="record-selection-details">
      <TutorialTip title="Map Record Evidence" body={MAP_RECORD_DETAILS_HELP} side="below">
        <span className="map-help-anchor">Source Evidence</span>
      </TutorialTip>
      <InfoGrid
        rows={[
          ["Label", record.label],
          ["Type", record.type],
          ["Source", record.source],
          ["Record", record.recordRef ?? "none"],
          ["Byte Range", record.byteRange ? `${record.byteRange.start}..${record.byteRange.endExclusive} (${record.byteRange.length} bytes)` : "none"],
          ["Edit State", userFacingEditState(record.editState ?? (record.editable ? "editable" : "inspect-only"))],
          ["Status", userFacingConfidence(record.confidence)]
        ]}
      />
      {mapRecord && (
        <MapRecordEditor
          map={map}
          record={mapRecord}
          semanticRecord={record}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {summaryRows.length > 0 && (
        <details className="context-section" open>
          <summary>
            <TutorialTip title="Decoded Fields" body={MAP_RECORD_DETAILS_HELP} side="below">
              <span>Decoded Fields</span>
            </TutorialTip>
            <b>{summaryRows.length}</b>
          </summary>
          <InfoGrid rows={summaryRows} />
        </details>
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
  );
}

function MapRecordEditor({
  map,
  record,
  semanticRecord,
  onSelectEntity,
  onApplyCommand
}: {
  map: MapEntity | null;
  record: MapRecord;
  semanticRecord: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) => {
    onApplyCommand({ kind: "updateMapRecord", label: `Update map record ${record.id}`, id: record.id, changes });
  };
  const markers = mapRecordMarkers(record);
  const updateMarker = (slot: number, changes: Partial<MapMarker>) => {
    update({ markers: markers.map((marker, index) => (index === slot ? { ...marker, ...changes } : marker)) });
  };
  const targetMapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
  return (
    <details className="context-section map-record-editor" open>
      <summary>
        <TutorialTip title="Edit Map Record" body={MAP_RECORD_EDITOR_HELP} side="below">
        <span>Edit Maps Menu Record</span>
        </TutorialTip>
        <b>Map Settings</b>
      </summary>
      <MapDiagnostics diagnostics={mapRecordDiagnostics(record, map)} />
      <div className="map-authoring-form">
        <MapNumberField label="Start X" value={record.startX} min={0} max={89} help={MAP_RECORD_START_HELP} onCommit={(startX) => update({ startX })} />
        <MapNumberField label="Start Y" value={record.startY} min={0} max={89} help={MAP_RECORD_START_HELP} onCommit={(startY) => update({ startY })} />
        <MapNumberField label="Level" value={record.level} min={0} max={255} help={MAP_RECORD_LEVEL_HELP} onCommit={(level) => update({ level })} />
        <MapNumberField label="Picture ID" value={record.pictId} help={MAP_RECORD_PICT_HELP} onCommit={(pictId) => update({ pictId })} />
        <MapNumberField label="Icon Size" value={record.iconSize} help={MAP_RECORD_ICON_SIZE_HELP} onCommit={(iconSize) => update({ iconSize })} />
        <MapNumberField label="Show" value={record.show} help={MAP_RECORD_SHOW_HELP} onCommit={(show) => update({ show })} />
        <label className="map-check-field">
          <input type="checkbox" checked={record.isDungeon} onChange={(event) => update({ isDungeon: event.currentTarget.checked })} />
          <TutorialTip title="Dungeon Record" body={MAP_RECORD_DUNGEON_HELP} side="right">
            <span>Dungeon record</span>
          </TutorialTip>
        </label>
      </div>
      <label className="context-field">
        <TutorialTip title="Map Record Note" body={MAP_RECORD_NOTE_HELP} side="right">
          <span>Note</span>
        </TutorialTip>
        <textarea value={record.note} maxLength={255} onChange={(event) => update({ note: event.currentTarget.value })} />
      </label>
      <details className="context-section">
        <summary>
          <TutorialTip title="Map Record Markers" body={MAP_RECORD_MARKERS_HELP} side="below">
            <span>Markers</span>
          </TutorialTip>
          <b>{activeMarkerCount(record)}/10</b>
        </summary>
        <div className="map-authoring-form">
          {markers.map((marker, slot) => (
            <div className="map-door-pair" key={slot}>
              <MapNumberField label={`M${slot + 1} Icon`} value={marker.iconId} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(iconId) => updateMarker(slot, { iconId })} />
              <MapNumberField label={`M${slot + 1} X`} value={marker.x} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(x) => updateMarker(slot, { x })} />
              <MapNumberField label={`M${slot + 1} Y`} value={marker.y} help={MAP_RECORD_MARKER_FIELD_HELP} onCommit={(y) => updateMarker(slot, { y })} />
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
          <MapNumberField label="Top" value={record.rect.top} help={MAP_RECORD_RECT_HELP} onCommit={(top) => update({ rect: { ...record.rect, top } })} />
          <MapNumberField label="Left" value={record.rect.left} help={MAP_RECORD_RECT_HELP} onCommit={(left) => update({ rect: { ...record.rect, left } })} />
          <MapNumberField label="Bottom" value={record.rect.bottom} help={MAP_RECORD_RECT_HELP} onCommit={(bottom) => update({ rect: { ...record.rect, bottom } })} />
          <MapNumberField label="Right" value={record.rect.right} help={MAP_RECORD_RECT_HELP} onCommit={(right) => update({ rect: { ...record.rect, right } })} />
        </div>
      </details>
      <div className="context-action-stack">
        <TutorialTip title="Open Related Map" body={MAP_RECORD_OPEN_HELP} side="below">
          <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => onSelectEntity({ type: "map", id: `map:${targetMapId}` })}>
            Open Related Map
          </button>
        </TutorialTip>
        <TutorialTip title="Copy Coordinates" body={MAP_RECORD_COPY_HELP} side="below">
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => navigator.clipboard?.writeText(`${record.startX},${record.startY}`)}>
            Copy Coordinates
          </button>
        </TutorialTip>
      </div>
      <p className="empty-copy compact">
        Menu names come from the scenario Map Names STR# resources. Unknown map-setting bytes stay preserved on export.
      </p>
    </details>
  );
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
    diagnostics.push(`This record points to ${record.isDungeon ? "dungeon" : "land"} ${record.level}, not the current map.`);
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
        <TutorialTip title={title} body={MAP_RECORD_LINKS_HELP} side="below">
          <span>{title}</span>
        </TutorialTip>
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
