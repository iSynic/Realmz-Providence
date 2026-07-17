import type { MapWorkbenchMode } from "../../types";
import { WorkbenchTabs, type WorkbenchTabOption } from "../../ui";

const MAP_SECTION_OPTIONS: ReadonlyArray<WorkbenchTabOption<MapWorkbenchMode>> = [
  { value: "canvas", label: "Canvas", title: "Map painting and placement" },
  { value: "land-layout", label: "Land Layout", title: "Outdoor adjacency grid" },
  { value: "land-tiles", label: "Land Tiles", title: "Tile attributes and combat map" },
  { value: "random-areas", label: "Random Encounters", title: "Encounter rectangles" }
];

export function MapSectionTabs({
  value,
  onChange
}: {
  value: MapWorkbenchMode;
  onChange: (mode: MapWorkbenchMode) => void;
}) {
  return (
    <nav className="map-section-browser" aria-label="Map sections">
      <span className="map-section-browser-label">Map Sections</span>
      <WorkbenchTabs
        className="map-section-tabs"
        ariaLabel="Map workbench sections"
        value={value}
        options={MAP_SECTION_OPTIONS}
        onChange={onChange}
      />
    </nav>
  );
}
