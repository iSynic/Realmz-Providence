import type { MapWorkbenchMode } from "../../types";

const MODE_COPY: Record<MapWorkbenchMode, { title: string; body: string }> = {
  canvas: {
    title: "Canvas tools",
    body: "Paint, sample, place Action Points, and work directly on the map."
  },
  "land-layout": {
    title: "Land Layout mode",
    body: "Use the center grid to arrange outdoor levels for off-map travel. Canvas painting tools are hidden here."
  },
  "land-tiles": {
    title: "Land Tiles mode",
    body: "Use the center suite to inspect landlook tiles, movement flags, and combat-map expansion. Painting tools live in Canvas mode."
  },
  "random-areas": {
    title: "Random Encounter Areas",
    body: "These are Realmz random encounter rectangles: chance, battle ranges, text, sound, and extra Action Point doors."
  }
};

export function MapToolsetModeNotice({
  mode,
  onReturnToCanvas
}: {
  mode: MapWorkbenchMode;
  onReturnToCanvas: () => void;
}) {
  return (
    <div className="map-toolset-mode-notice">
      <strong>{MODE_COPY[mode].title}</strong>
      <p>{MODE_COPY[mode].body}</p>
      <button className="btn btn-secondary btn-xs" type="button" onClick={onReturnToCanvas}>
        Return To Canvas Tools
      </button>
    </div>
  );
}
