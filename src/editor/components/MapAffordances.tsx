import { EditorTool, MapEntity, RandomLevel, SemanticEntity, TriggerRecord } from "../types";
import { TutorialTip } from "./TutorialTip";

export function MapCapabilityPanel({
  map,
  randomLevel,
  activeTool,
  onSelectRandomRect
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  onSelectRandomRect?: (rectIndex: number) => void;
}) {
  const isDungeon = map?.levelType === "dungeon";
  return (
    <>
      <details className="context-section affordance-section" open>
        <summary>
          <span>{isDungeon ? "Dungeon Tools" : "Level Tools"}</span>
          <b>{activeToolLabel(activeTool)}</b>
        </summary>
        <div className="affordance-button-grid">
          <AffordanceButton label="Level Layout" body="Inspect the map-to-map layout references that stitch levels together. Editing stays blocked until MD2 writing is fixture-backed." />
          <AffordanceButton label="Scenario Hub" body="Scenario startup, global macros, strings, and resource setup live here as inspectable semantic groups." />
          <AffordanceButton label="Tile Atlases" body="Inspect standard and custom tileset resources used by this map, including imported atlas coverage." />
          <AffordanceButton label="Action Scripts" body="Jump into the Action Point script surface for this level. The Scripts rail tab owns deeper script browsing." />
          <AffordanceButton label="Undo Tile" body="Undo/redo tracks safe Providence project edits. Action Point mutation remains guarded until writers are backed by fixtures." tone="ready" />
          <AffordanceButton label="Remove AP" body="Remove an Action Point through the semantic record once editing is enabled, instead of hiding it by painting over the tile." tone="blocked" />
          <AffordanceButton label="Force Clear" body="Emergency destructive cleanup for malformed Action Point markers. Visible for parity, blocked for now." tone="danger" />
          <AffordanceButton label="Clear Level" body="Replace the entire level with the selected tile. This stays blocked until destructive export flows are safer." tone="danger" />
        </div>
      </details>
      <details className="context-section affordance-section" open>
        <summary>
          <span>Random Areas</span>
          <b>{randomLevel?.rects.length ?? 0} / 20</b>
        </summary>
        <div className="affordance-button-grid compact">
          <AffordanceButton label="Set Area" body="Drag out the top, left, bottom, and right bounds for a Random Rectangle once editing is enabled." />
          <AffordanceButton label="Highlight" body="Locate and highlight the selected Random Rectangle on the map." tone="ready" />
          <AffordanceButton label="Show All" body="Show every Random Rectangle on the current level." tone="ready" />
          <AffordanceButton label="Go To" body="Scroll the canvas to a chosen Random Rectangle." />
        </div>
        <div className="mini-rect-list">
          {randomLevel?.rects.slice(0, 6).map((rect) => (
            <button key={rect.rectIndex} className="mini-rect-row" type="button" onClick={() => onSelectRandomRect?.(rect.rectIndex)}>
              <strong>Rect {rect.rectIndex}</strong>
              <span>{rect.left},{rect.top} to {rect.right},{rect.bottom}</span>
              <small>{rect.percent} / 10000 | battles {rect.battleRange.join("-")}</small>
            </button>
          ))}
          {!randomLevel?.rects.length && <p className="empty-copy compact">No active Random Rectangles decoded for this level.</p>}
        </div>
      </details>
      {isDungeon && (
        <details className="context-section affordance-section" open>
          <summary>
            <span>Cell Flags</span>
            <b>inspect</b>
          </summary>
          <div className="bit-toggle-grid">
            {["Wall", "Door", "Stairs", "Secret", "Move Up", "Move Right", "Move Down", "Move Left"].map((label) => (
              <label key={label}>
                <input type="checkbox" disabled />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      <details className="context-section affordance-section">
        <summary>
          <span>Editor Shortcuts</span>
          <b>help</b>
        </summary>
        <div className="modifier-grid">
          <span><b>Control</b> Sample tile</span>
          <span><b>Shift</b> Paint 3 x 3</span>
          <span><b>Command</b> Create Action Point</span>
          <span><b>Option</b> Center map / dungeon erase</span>
        </div>
      </details>
    </>
  );
}

export function ActionPointCodeTable({ trigger }: { trigger: TriggerRecord }) {
  return (
    <div className="code-id-table">
      <div className="code-id-head">
        <span>Step</span>
        <span>Code</span>
        <span>ID</span>
        <span>Meaning</span>
      </div>
      {Array.from({ length: 8 }, (_, slot) => {
        const action = trigger.actions.find((candidate) => candidate.slot === slot);
        return (
          <div key={slot} className={action ? "filled" : ""}>
            <span>{slot}</span>
            <span>{action?.rawCode ?? 0}{action?.gosub ? "*" : ""}</span>
            <span>{action?.id ?? 0}</span>
            <span>{action?.label ?? "Empty"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RandomRectangleForm({ rect }: { rect: RandomLevel["rects"][number] }) {
  return (
    <div className="affordance-form-grid">
      <ReadOnlyField label="Top" value={rect.top} />
      <ReadOnlyField label="Left" value={rect.left} />
      <ReadOnlyField label="Bottom" value={rect.bottom} />
      <ReadOnlyField label="Right" value={rect.right} />
      <ReadOnlyField label="Times in 10000" value={rect.percent} wide />
      <ReadOnlyField label="Battle Low" value={rect.battleRange[0]} />
      <ReadOnlyField label="Battle High" value={rect.battleRange[1]} />
      <ReadOnlyField label="% Option" value={rect.option} />
      <ReadOnlyField label="Text" value={rect.text} />
      {rect.randomDoors.map((door, index) => (
        <ReadOnlyField key={index} label={`Extra AP ${index + 1}`} value={`${door} @ ${rect.randomDoorPercent[index]}%`} />
      ))}
    </div>
  );
}

export function CellTileEvidence({ cell, records }: { cell: { x: number; y: number; tile: number }; records: SemanticEntity[] }) {
  const baseTile = normalizedTile(cell.tile);
  return (
    <div className="tile-evidence">
      <span><b>Base Tile</b>{baseTile}</span>
      <span><b>AP Marker</b>{Math.abs(cell.tile) >= 1000 ? "yes" : "no"}</span>
      <span><b>Path Bit</b>{Boolean(cell.tile & 4) ? "yes" : "no"}</span>
      <span><b>Map Starts</b>{records.length}</span>
    </div>
  );
}

function AffordanceButton({
  label,
  body,
  tone = "planned"
}: {
  label: string;
  body: string;
  tone?: "planned" | "ready" | "blocked" | "danger";
}) {
  return (
    <TutorialTip title={label} body={body} side="right">
      <button className={`affordance-button ${tone}`} type="button" aria-disabled={tone !== "ready"}>
        {label}
      </button>
    </TutorialTip>
  );
}

function ReadOnlyField({ label, value, wide = false }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      <input readOnly value={value} />
    </label>
  );
}

function activeToolLabel(tool: EditorTool) {
  if (tool === "trigger") return "Action Point";
  return tool;
}

function normalizedTile(value: number) {
  let out = value;
  while (out > 999) out -= 1000;
  while (out < -999) out += 1000;
  return out;
}
