import { EditorTool, MapEntity, RandomLevel, SemanticEntity, TriggerRecord } from "../types";
import { TutorialTip } from "./TutorialTip";

export function MapCapabilityPanel({
  map,
  randomLevel,
  activeTool,
  showRandomRects,
  onSetTool,
  onOpenPalette,
  onFocusFlags,
  onFocusAtlas,
  onClearLevel,
  onShowRandomRects,
  onHighlightRandomRect,
  onEditRandomRect,
  onSelectRandomRect
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  showRandomRects: boolean;
  onSetTool: (tool: EditorTool) => void;
  onOpenPalette: () => void;
  onFocusFlags: () => void;
  onFocusAtlas: () => void;
  onClearLevel: () => void;
  onShowRandomRects: () => void;
  onHighlightRandomRect: () => void;
  onEditRandomRect: () => void;
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
          <AffordanceButton label="Paint Tiles" body="Use Paint and Sample to edit Realmz land and dungeon tile fields through the paint command path." tone="ready" onClick={() => { onSetTool("paint"); onOpenPalette(); }} />
          <AffordanceButton label="Stamp Tiles" body="Place special land tiles, corpses, props, and icon-backed map art through Realmz tile values." tone="ready" onClick={() => onSetTool("stamp")} />
          <AffordanceButton label="Action Points" body="Use the Action Point tool or selected-cell actions to create, move, edit, and clear AP records." tone="ready" onClick={() => onSetTool("trigger")} />
          <AffordanceButton label="Map Flags" body="Landlook, darkness, and LOS are writable through the current map setup controls." tone="ready" onClick={onFocusFlags} />
          <AffordanceButton label="Tile Atlases" body="Inspect standard and custom tileset resources used by this map, including imported atlas coverage." tone="ready" onClick={() => { onFocusAtlas(); onOpenPalette(); }} />
          <AffordanceButton label="Clear Level" body="Clear every cell to the level's base tile after confirmation." tone="danger" onClick={onClearLevel} />
        </div>
      </details>
      <details className="context-section affordance-section">
        <summary>
          <span>Source Evidence</span>
          <b>layout</b>
        </summary>
        <p className="empty-copy compact">Level layout and map-to-map start records are preserved as source evidence until writer support is fixture-backed.</p>
      </details>
      <details className="context-section affordance-section" open>
        <summary>
          <span>Random Areas</span>
          <b>{randomLevel?.rects.length ?? 0} / 20{showRandomRects ? "" : " hidden"}</b>
        </summary>
        <div className="affordance-button-grid compact">
          <AffordanceButton label="Set Area" body="Use the Random Area tool or selected-cell actions to create and resize a Random Rectangle." tone="ready" onClick={() => onSetTool("random")} />
          <AffordanceButton label="Highlight" body="Locate and highlight the first selected Random Rectangle on the map." tone="ready" onClick={onHighlightRandomRect} disabled={!randomLevel?.rects.length} />
          <AffordanceButton label="Show All" body="Show every Random Rectangle on the current level." tone="ready" onClick={onShowRandomRects} />
          <AffordanceButton label="Edit Fields" body="Select a Random Rectangle to edit bounds, chance, battles, text, sound, and extra AP doors." tone="ready" onClick={onEditRandomRect} disabled={!randomLevel?.rects.length} />
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
  tone = "planned",
  onClick,
  disabled = false
}: {
  label: string;
  body: string;
  tone?: "planned" | "ready" | "blocked" | "danger";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || !onClick;
  return (
    <TutorialTip title={label} body={body} side="right">
      <button className={`affordance-button ${tone}`} type="button" disabled={isDisabled} aria-disabled={isDisabled} onClick={onClick}>
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
  if (tool === "stamp") return "Stamp";
  return tool;
}

function normalizedTile(value: number) {
  let out = value;
  while (out > 999) out -= 1000;
  while (out < -999) out += 1000;
  return out;
}
