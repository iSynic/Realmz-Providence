import type { MapSidebarInspector } from "./mapInspectorRouting";

export function MapInspectorCollapsedRail({
  label,
  onOpen
}: {
  label: "Paint" | "Inspector";
  onOpen: () => void;
}) {
  return (
    <aside className="map-context-rail">
      <button type="button" onClick={onOpen}>{label}</button>
    </aside>
  );
}

export function MapInspectorSwitcher({
  value,
  hasSelection,
  hasDungeonDraw,
  onChange
}: {
  value: MapSidebarInspector;
  hasSelection: boolean;
  hasDungeonDraw: boolean;
  onChange: (choice: MapSidebarInspector) => void;
}) {
  return (
    <select
      className="map-inspector-switcher"
      aria-label="Choose right sidebar inspector"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as MapSidebarInspector)}
    >
      <option value="setup">Map Setup</option>
      <option value="paint">Paint Inspector</option>
      <option value="dungeon-draw" disabled={!hasDungeonDraw}>Dungeon Draw</option>
      <option value="selection" disabled={!hasSelection}>Selection Inspector</option>
      <option value="land-layout">Land Layout</option>
      <option value="land-tiles">Land Tiles</option>
      <option value="random-areas">Random Rectangles</option>
    </select>
  );
}
