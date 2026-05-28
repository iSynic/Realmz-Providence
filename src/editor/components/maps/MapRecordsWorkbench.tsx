import { useEffect, useState } from "react";
import { MapEntity, MapRecord, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../../utils";
import { InfoGrid } from "../InfoGrid";
import { MapDiagnostics, MapNumberField } from "./MapFormControls";

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
  if (!project) return <p className="empty-copy compact">Open a project to browse map records.</p>;
  return (
    <div className="map-records-workbench">
      <div className="map-records-toolbar">
        <InfoGrid
          rows={[
            ["Shown", visibleRecords.length],
            ["Total Records", records.length],
            ["Current Map", selectedMap?.name ?? "All maps"],
            ["Source", "Data MD2"]
          ]}
        />
        <div className="context-action-stack compact">
          <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
            onSetWorkbenchMode("canvas");
            onSetViewFlag("showMapRecords", true);
          }}>
            Show On Canvas
          </button>
        </div>
      </div>
      <div className="map-records-layout">
        <div className="map-records-table" role="list" aria-label="Map records">
          {visibleRecords.map((record) => (
            <button
              key={record.id}
              type="button"
              className={record.id === selectedRecordId ? "selected" : ""}
              onClick={() => setSelectedRecordId(record.id)}
            >
              <span>
                <b>{record.primaryName || record.name || `Map Record ${record.id}`}</b>
                <small>{record.isDungeon ? "Dungeon" : "Land"} {record.level} at {record.startX},{record.startY}</small>
              </span>
              <em>PICT {record.pictId || "none"}</em>
            </button>
          ))}
          {visibleRecords.length === 0 && <span className="empty-inline">No map records resolve to the current map.</span>}
        </div>
        <div className="map-record-detail">
          {selectedRecord && selectedSemantic ? (
            <>
              <div className="map-record-summary-card">
                <InfoGrid
                  rows={[
                    ["Name", selectedRecord.primaryName || selectedRecord.name || `Map Record ${selectedRecord.id}`],
                    ["Level", `${selectedRecord.isDungeon ? "Dungeon" : "Land"} ${selectedRecord.level}`],
                    ["Start", `${selectedRecord.startX}, ${selectedRecord.startY}`],
                    ["Picture", selectedRecord.pictId || "none"],
                    ["Show", selectedRecord.show],
                    ["Rect", `${selectedRecord.rect.left},${selectedRecord.rect.top} to ${selectedRecord.rect.right},${selectedRecord.rect.bottom}`],
                    ["Note", selectedRecord.note || "none"]
                  ]}
                />
                <div className="context-action-stack compact">
                  <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
                    onSelectMap(`map:${selectedRecord.isDungeon ? "dungeon" : "land"}:${selectedRecord.level}`);
                    onSetWorkbenchMode("canvas");
                    onSetViewFlag("showMapRecords", true);
                    onSelectEntity(selectEntityFromId(`map-record:${selectedRecord.id}`));
                  }}>
                    Open Related Map
                  </button>
                  <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => navigator.clipboard?.writeText(`${selectedRecord.startX},${selectedRecord.startY}`)}>
                    Copy Coordinates
                  </button>
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
            <p className="empty-copy compact">Select a map record to inspect or edit it.</p>
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
    label: record.primaryName || record.name || `Map Record ${record.id}`,
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
      name: record.primaryName || record.name || `Map Record ${record.id}`,
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
          <summary><span>Decoded Fields</span><b>{summaryRows.length}</b></summary>
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
  const targetMapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
  return (
    <details className="context-section map-record-editor" open>
      <summary><span>Edit Map Record</span><b>Data MD2</b></summary>
      <MapDiagnostics diagnostics={mapRecordDiagnostics(record, map)} />
      <div className="map-authoring-form">
        <MapNumberField label="Start X" value={record.startX} min={0} max={89} onCommit={(startX) => update({ startX })} />
        <MapNumberField label="Start Y" value={record.startY} min={0} max={89} onCommit={(startY) => update({ startY })} />
        <MapNumberField label="Level" value={record.level} min={0} max={255} onCommit={(level) => update({ level })} />
        <MapNumberField label="Picture ID" value={record.pictId} onCommit={(pictId) => update({ pictId })} />
        <MapNumberField label="Icon Size" value={record.iconSize} onCommit={(iconSize) => update({ iconSize })} />
        <MapNumberField label="Show" value={record.show} onCommit={(show) => update({ show })} />
        <label className="map-check-field">
          <input type="checkbox" checked={record.isDungeon} onChange={(event) => update({ isDungeon: event.currentTarget.checked })} />
          <span>Dungeon record</span>
        </label>
      </div>
      <label className="context-field">
        <span>Note</span>
        <textarea value={record.note} maxLength={255} onChange={(event) => update({ note: event.currentTarget.value })} />
      </label>
      <details className="context-section">
        <summary><span>Display Rect</span><b>{record.rect.left},{record.rect.top}</b></summary>
        <div className="map-authoring-form">
          <MapNumberField label="Top" value={record.rect.top} onCommit={(top) => update({ rect: { ...record.rect, top } })} />
          <MapNumberField label="Left" value={record.rect.left} onCommit={(left) => update({ rect: { ...record.rect, left } })} />
          <MapNumberField label="Bottom" value={record.rect.bottom} onCommit={(bottom) => update({ rect: { ...record.rect, bottom } })} />
          <MapNumberField label="Right" value={record.rect.right} onCommit={(right) => update({ rect: { ...record.rect, right } })} />
        </div>
      </details>
      <div className="context-action-stack">
        <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => onSelectEntity({ type: "map", id: `map:${targetMapId}` })}>
          Open Related Map
        </button>
        <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => navigator.clipboard?.writeText(`${record.startX},${record.startY}`)}>
          Copy Coordinates
        </button>
      </div>
      <p className="empty-copy compact">
        Names stay read-only because they are stored in the scenario resource data. Unknown icon-slot bytes are kept intact from {semanticRecord.recordRef ?? "Data MD2"}.
      </p>
    </details>
  );
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
      <summary><span>{title}</span><b>{links.length}</b></summary>
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
