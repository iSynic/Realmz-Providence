import { ChevronDown, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EditorState } from "../store";
import { MapViewFlag } from "../types";
import { IconButton } from "./IconButton";
import { TutorialTip } from "./TutorialTip";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_BUTTON_STEP = 0.25;

const FILTERS: { flag: MapViewFlag; label: string; title: string; body: string }[] = [
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
    flag: "showTriggers",
    label: "Triggers",
    title: "Action Points",
    body: "Show placed Action Points and Dungeon Action Points on the map canvas. Use this before painting near scripted cells so AP placement is not accidentally obscured."
  },
  {
    flag: "showRandomRects",
    label: "Random",
    title: "Random Rectangles",
    body: "Show Random Rectangles used for random battles, invisible encounters, and Extra Action Points. Realmz stores their chance as times in 10,000."
  },
  {
    flag: "showEncounterOverlays",
    label: "Encounters",
    title: "Encounter Links",
    body: "Keep Action Points visible when their scripts reference Simple or Complex Encounters."
  },
  {
    flag: "showQuestOverlays",
    label: "Quest",
    title: "Quest And Branch Links",
    body: "Keep Action Points visible when their scripts branch on state, time, or quest-like conditions."
  },
  {
    flag: "showMapOverlays",
    label: "Map",
    title: "Map Mutation Links",
    body: "Keep Action Points visible when their scripts teleport, mutate tiles, enter dungeons, or otherwise affect maps."
  },
  {
    flag: "showBattleOverlays",
    label: "Battle",
    title: "Battle Links",
    body: "Keep Action Points visible when their scripts start battles or combat-oriented effects."
  },
  {
    flag: "showTextOverlays",
    label: "Text",
    title: "Text Links",
    body: "Keep Action Points visible when their scripts display strings, pictures, sounds, or UI prompts."
  },
  {
    flag: "showUnknownOverlays",
    label: "Unknown",
    title: "Unknown Opcodes",
    body: "Keep unresolved or partially decoded Action Points visible so they are not accidentally ignored."
  },
  {
    flag: "showSecretOverlays",
    label: "Secrets",
    title: "Secret Tile Overlay",
    body: "Show official-style Realmz secret and passable marker overlays on top of the underlying tile art. These markers do not replace the map tile itself."
  },
  {
    flag: "showMapRecords",
    label: "Starts",
    title: "Map Starts",
    body: "Show map-record start positions and scenario entry points when Providence can resolve them. These are separate from Action Point trigger locations."
  }
];

export function MapViewFilters({
  state,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag
}: {
  state: EditorState;
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeOverlays = FILTERS.filter((filter) => state[filter.flag]).length + (state.smoothTiles ? 1 : 0);
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
              <span>Solo</span>
              {FILTERS.map((filter) => (
                <OverlayRow
                  key={filter.flag}
                  label={filter.label}
                  title={filter.title}
                  body={filter.body}
                  checked={state[filter.flag]}
                  onChecked={(value) => onSetViewFlag(filter.flag, value)}
                  onSolo={() => soloFilter(filter.flag, onSetViewFlag)}
                />
              ))}
              <OverlayRow
                label="Smooth"
                title="Smooth Tiles"
                body="Use browser image smoothing for a less crunchy zoomed-in view. Disable it for exact pixel inspection."
                checked={state.smoothTiles}
                onChecked={onSetSmoothTiles}
              />
            </div>
            <div className="overlay-popover-actions">
              <button type="button" onClick={() => setAllFilters(true, onSetViewFlag, onSetSmoothTiles)}>Show All</button>
              <button type="button" onClick={() => setAllFilters(false, onSetViewFlag, onSetSmoothTiles)}>Hide All</button>
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
  onSolo
}: {
  label: string;
  title: string;
  body: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
  onSolo?: () => void;
}) {
  return (
    <>
      <TutorialTip title={title} body={body} side="right">
        <strong className="overlay-category-label">{label}</strong>
      </TutorialTip>
      <label className="overlay-check">
        <input type="checkbox" checked={checked} onChange={(event) => onChecked(event.currentTarget.checked)} />
      </label>
      {onSolo ? (
        <button className="overlay-solo" type="button" onClick={onSolo}>Only</button>
      ) : (
        <span className="overlay-solo muted">-</span>
      )}
    </>
  );
}

function setAllFilters(
  value: boolean,
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void,
  onSetSmoothTiles: (value: boolean) => void
) {
  for (const filter of FILTERS) onSetViewFlag(filter.flag, value);
  onSetSmoothTiles(value);
}

function soloFilter(flag: MapViewFlag, onSetViewFlag: (flag: MapViewFlag, value: boolean) => void) {
  for (const filter of FILTERS) onSetViewFlag(filter.flag, filter.flag === flag);
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}
