import { ChevronDown, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "../store";
import { MapEntity, MapViewFlag, RandomLevel, SemanticEntity } from "../types";
import { mapRecordTerrainFootprint, randomRectCellBounds, randomRectEntityId } from "../map/geometry";
import { IconButton } from "./IconButton";
import { TutorialTip } from "./TutorialTip";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_BUTTON_STEP = 0.25;

type OverlayFilter = { flag: MapViewFlag; label: string; title: string; body: string };

const DISPLAY_FILTERS: OverlayFilter[] = [
  {
    flag: "showRealTiles",
    label: "Real tiles",
    title: "Real Tiles",
    body: "Draw available Realmz PICT tile atlases and special/icon art instead of decoded fallback colors. Turn this off when raw value auditing matters more than final appearance."
  },
  {
    flag: "showRealmzCoordinates",
    label: "Realmz XY",
    title: "Realmz Coordinates",
    body: "Show Realmz grid coordinates outside the map edge so tile, Action Point, random rectangle, and map-start positions line up with source records without covering edge tiles."
  },
  {
    flag: "showSecretOverlays",
    label: "Secrets",
    title: "Secret Tile Overlay",
    body: "Show official-style Realmz secret and passable marker overlays on top of the underlying tile art. These markers do not replace the map tile itself."
  }
];

const ACTION_POINT_FILTER: OverlayFilter = {
  flag: "showTriggers",
  label: "Action Points",
  title: "Action Points",
  body: "Show placed Action Points and Dungeon Action Points on the map canvas."
};

const RANDOM_RECTANGLE_FILTER: OverlayFilter = {
  flag: "showRandomRects",
  label: "Random Rectangles",
  title: "Random Rectangles",
  body: "Show Random Rectangles used for random battles, invisible encounters, and Extra Action Points. Realmz stores their chance as times in 10,000."
};

const PLAYER_MAP_FILTER: OverlayFilter = {
  flag: "showMapRecords",
  label: "Player Maps",
  title: "Player Map Areas",
  body: "Show the terrain area displayed by Player Map entries, plus the top-left anchor they use. Picture-backed and scrolling-text entries are edited in Player Maps, not drawn on the terrain canvas."
};

const FILTERS: OverlayFilter[] = [
  ...DISPLAY_FILTERS,
  ACTION_POINT_FILTER,
  RANDOM_RECTANGLE_FILTER,
  PLAYER_MAP_FILTER
];

export function MapViewFilters({
  state,
  selectedMap,
  selectedRandomLevel,
  mapRecords,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag,
  onSetVisibleRandomRectIds,
  onSetVisibleMapRecordIds
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetVisibleRandomRectIds: (ids: string[]) => void;
  onSetVisibleMapRecordIds: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const randomEntries = useMemo(
    () => buildRandomRectangleEntries(selectedMap, selectedRandomLevel),
    [selectedMap, selectedRandomLevel]
  );
  const mapRecordEntries = useMemo(
    () => buildMapRecordEntries(selectedMap, mapRecords),
    [selectedMap, mapRecords]
  );
  const visibleRandomCount = visibleEntryCount(state.showRandomRects, state.visibleRandomRectIds, randomEntries);
  const visibleMapRecordCount = visibleEntryCount(state.showMapRecords, state.visibleMapRecordIds, mapRecordEntries);
  const activeOverlays = FILTERS.filter((filter) => {
    if (filter.flag === "showRandomRects") return visibleRandomCount > 0;
    if (filter.flag === "showMapRecords") return visibleMapRecordCount > 0;
    return state[filter.flag];
  }).length + (state.smoothTiles ? 1 : 0);
  const totalOverlays = FILTERS.length + 1;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="map-filterbar">
      <div className="overlay-menu-wrap" ref={popoverRef}>
        <button className="overlay-menu-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <Eye size={15} />
          <span>Overlays</span>
          <b>{activeOverlays}/{totalOverlays}</b>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="overlay-popover" role="menu">
            <div className="overlay-popover-head">
              <strong>Map Overlays</strong>
              <span>{activeOverlays} visible</span>
            </div>
            <div className="overlay-table">
              <span>Category</span>
              <span>Show</span>
              {FILTERS.map((filter) => {
                if (filter.flag === "showRandomRects") {
                  return (
                    <OverlayEntryGroup
                      key={filter.flag}
                      flag={filter.flag}
                      label={filter.label}
                      title={filter.title}
                      body={filter.body}
                      entries={randomEntries}
                      categoryChecked={state.showRandomRects}
                      visibleIds={state.visibleRandomRectIds}
                      onSetViewFlag={onSetViewFlag}
                      onSetVisibleIds={onSetVisibleRandomRectIds}
                    />
                  );
                }
                if (filter.flag === "showMapRecords") {
                  return (
                    <OverlayEntryGroup
                      key={filter.flag}
                      flag={filter.flag}
                      label={filter.label}
                      title={filter.title}
                      body={filter.body}
                      entries={mapRecordEntries}
                      categoryChecked={state.showMapRecords}
                      visibleIds={state.visibleMapRecordIds}
                      onSetViewFlag={onSetViewFlag}
                      onSetVisibleIds={onSetVisibleMapRecordIds}
                    />
                  );
                }
                return (
                  <OverlayRow
                    key={filter.flag}
                    label={filter.label}
                    title={filter.title}
                    body={filter.body}
                    checked={state[filter.flag]}
                    onChecked={(value) => onSetViewFlag(filter.flag, value)}
                  />
                );
              })}
              <OverlayRow
                label="Smooth"
                title="Smooth Tiles"
                body="Use browser image smoothing for a less crunchy zoomed-in view. Disable it for exact pixel inspection."
                checked={state.smoothTiles}
                onChecked={onSetSmoothTiles}
              />
            </div>
            <div className="overlay-popover-actions">
              <button type="button" onClick={() => setAllFilters(true, onSetViewFlag, onSetSmoothTiles, onSetVisibleRandomRectIds, onSetVisibleMapRecordIds)}>Show All</button>
              <button type="button" onClick={() => setAllFilters(false, onSetViewFlag, onSetSmoothTiles, onSetVisibleRandomRectIds, onSetVisibleMapRecordIds)}>Hide All</button>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
      <div className="zoom-cluster">
        <IconButton title="Zoom out" onClick={() => onSetZoom(clampZoom(Number((state.zoom - ZOOM_BUTTON_STEP).toFixed(2))))}>
          <ZoomOut size={15} />
        </IconButton>
        <input
          className="zoom-slider"
          type="range"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={5}
          value={Math.round(state.zoom * 100)}
          title="Canvas zoom"
          onChange={(event) => onSetZoom(clampZoom(Number(event.currentTarget.value) / 100))}
        />
        <span className="zoom-readout">{Math.round(state.zoom * 100)}%</span>
        <IconButton title="Zoom in" onClick={() => onSetZoom(clampZoom(Number((state.zoom + ZOOM_BUTTON_STEP).toFixed(2))))}>
          <ZoomIn size={15} />
        </IconButton>
      </div>
    </div>
  );
}

function OverlayRow({
  label,
  title,
  body,
  checked,
  onChecked,
  indeterminate = false,
  disabled = false
}: {
  label: string;
  title: string;
  body: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <>
      <TutorialTip title={title} body={body} side="right">
        <strong className={`overlay-category-label${disabled ? " disabled" : ""}`}>{label}</strong>
      </TutorialTip>
      <label className="overlay-check">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChecked(event.currentTarget.checked)}
        />
      </label>
    </>
  );
}

type OverlayEntry<T extends string | number> = {
  id: T;
  label: string;
  detail: string;
};

function OverlayEntryGroup<T extends string | number>({
  flag,
  label,
  title,
  body,
  entries,
  categoryChecked,
  visibleIds,
  onSetViewFlag,
  onSetVisibleIds
}: {
  flag: MapViewFlag;
  label: string;
  title: string;
  body: string;
  entries: OverlayEntry<T>[];
  categoryChecked: boolean;
  visibleIds: T[];
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetVisibleIds: (ids: T[]) => void;
}) {
  const entryIds = entries.map((entry) => entry.id);
  const selectedIds = categoryChecked
    ? visibleIds.length === 0 ? entryIds : visibleIds.filter((id) => entryIds.includes(id))
    : [];
  const checked = entries.length > 0 && categoryChecked && selectedIds.length === entries.length;
  const indeterminate = entries.length > 0 && categoryChecked && selectedIds.length > 0 && selectedIds.length < entries.length;

  function setCategory(value: boolean) {
    onSetVisibleIds([]);
    onSetViewFlag(flag, value);
  }

  function toggleEntry(id: T, value: boolean) {
    const base = categoryChecked && visibleIds.length === 0 ? entryIds : visibleIds.filter((candidate) => entryIds.includes(candidate));
    const next = value
      ? Array.from(new Set([...base, id]))
      : base.filter((candidate) => candidate !== id);
    onSetVisibleIds(next);
    onSetViewFlag(flag, next.length > 0);
  }

  return (
    <>
      <OverlayRow
        label={label}
        title={title}
        body={body}
        checked={checked}
        indeterminate={indeterminate}
        disabled={entries.length === 0}
        onChecked={setCategory}
      />
      {entries.length > 1 && (
        <details className="overlay-entry-details">
          <summary>{selectedIds.length === entries.length ? `All ${entries.length}` : `${selectedIds.length} of ${entries.length}`}</summary>
          <div className="overlay-entry-list">
            {entries.map((entry) => {
              const entryChecked = categoryChecked && (visibleIds.length === 0 || visibleIds.includes(entry.id));
              return (
                <label key={String(entry.id)} className="overlay-entry-row">
                  <input type="checkbox" checked={entryChecked} onChange={(event) => toggleEntry(entry.id, event.currentTarget.checked)} />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.detail}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </details>
      )}
    </>
  );
}

function setAllFilters(
  value: boolean,
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void,
  onSetSmoothTiles: (value: boolean) => void,
  onSetVisibleRandomRectIds: (ids: string[]) => void,
  onSetVisibleMapRecordIds: (ids: number[]) => void
) {
  for (const filter of FILTERS) onSetViewFlag(filter.flag, value);
  onSetVisibleRandomRectIds([]);
  onSetVisibleMapRecordIds([]);
  onSetSmoothTiles(value);
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function buildRandomRectangleEntries(map: MapEntity | null, randomLevel: RandomLevel | null): OverlayEntry<string>[] {
  if (!map || !randomLevel) return [];
  return randomLevel.rects.map((rect) => {
    const bounds = randomRectCellBounds(rect);
    const battleLow = rect.battleRange[0] ?? 0;
    const battleHigh = rect.battleRange[1] ?? battleLow;
    return {
      id: randomRectEntityId(map, rect.rectIndex),
      label: `Random Rectangle ${rect.rectIndex}`,
      detail: `${bounds.left},${bounds.top} to ${bounds.right},${bounds.bottom} | ${rect.percent}/10000 | battles ${battleLow}-${battleHigh}`
    };
  });
}

function buildMapRecordEntries(map: MapEntity | null, records: SemanticEntity[]): OverlayEntry<number>[] {
  if (!map) return [];
  return records.flatMap((record) => {
    const id = semanticMapRecordId(record);
    const footprint = mapRecordTerrainFootprint(record, map);
    if (id == null || !footprint) return [];
    const label = record.label ? `Player Map ${id}: ${record.label}` : `Player Map ${id}`;
    return [{
      id,
      label,
      detail: `${footprint.left},${footprint.top} to ${footprint.right},${footprint.bottom}`
    }];
  });
}

function visibleEntryCount<T extends string | number>(enabled: boolean, visibleIds: T[], entries: OverlayEntry<T>[]) {
  if (!enabled || entries.length === 0) return 0;
  if (visibleIds.length === 0) return entries.length;
  const entryIds = new Set(entries.map((entry) => entry.id));
  return visibleIds.filter((id) => entryIds.has(id)).length;
}

function semanticMapRecordId(record: SemanticEntity) {
  const summaryId = record.summary.id;
  if (typeof summaryId === "number" && Number.isFinite(summaryId)) return Math.trunc(summaryId);
  const match = /^map-record:(-?\d+)$/.exec(record.id);
  return match ? Number(match[1]) : null;
}
