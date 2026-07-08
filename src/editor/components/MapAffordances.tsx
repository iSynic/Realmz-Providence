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
  onFocusLayout,
  onClearLevel,
  onShowRandomRects,
  onHighlightRandomRect,
  onEditRandomRect,
  onSelectRandomRect,
  onMapEntireDungeon,
  onUnmapEntireDungeon
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  showRandomRects: boolean;
  onSetTool: (tool: EditorTool) => void;
  onOpenPalette: () => void;
  onFocusFlags: () => void;
  onFocusAtlas: () => void;
  onFocusLayout: () => void;
  onClearLevel: () => void;
  onShowRandomRects: () => void;
  onHighlightRandomRect: () => void;
  onEditRandomRect: () => void;
  onSelectRandomRect?: (rectIndex: number) => void;
  onMapEntireDungeon?: () => void;
  onUnmapEntireDungeon?: () => void;
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
          {isDungeon ? (
            <AffordanceButton label="Dungeon Flags" body="Dungeon cells are authored through wall, door, stair, column, archway, unmapped, movement, and battle-wall flags rather than land tile palettes." tone="ready" onClick={onFocusFlags} />
          ) : (
            <>
              <AffordanceButton label="Paint Tiles" body="Use Paint and Sample to edit raw Realmz map-field values. Brush, Eraser, Fill Chance, custom palettes, and Smart terrain all write normal undoable tile edits." tone="ready" onClick={() => { onSetTool("paint"); onOpenPalette(); }} />
              <AffordanceButton label="Special / Icons" body="Open the Paint palette to place negative special land cicn tiles and icon-backed values. Large buildings and landmarks usually live here, not in ordinary landlook terrain." tone="ready" onClick={() => { onSetTool("paint"); onOpenPalette(); }} />
            </>
          )}
          <AffordanceButton label="Action Points" body="Use the Action Point tool or selected-cell actions to create, move, edit, and clear AP records. Use Scripts for the deeper opcode and target workflow." tone="ready" onClick={() => onSetTool("trigger")} />
          <AffordanceButton label="Map Flags" body="Edit map setup such as landlook, renderer, darkness, and line of sight. Providence previews LOS/darkness as editor guidance, not Realmz runtime visibility cache data." tone="ready" onClick={onFocusFlags} />
          {!isDungeon && <AffordanceButton label="Edit Land Tiles" body="Open the current landlook atlas, tile metadata, Data Solids evidence, and Divinity-style combat expansion preview for the selected map." tone="ready" onClick={onFocusAtlas} />}
          <AffordanceButton label="Clear Level" body={isDungeon ? "Fill every dungeon cell with the standard wall tile after confirmation." : "Clear every cell to the level's base tile after confirmation."} tone="danger" onClick={onClearLevel} />
        </div>
      </details>
      <details className="context-section affordance-section">
        <summary>
          <span>Land Layout</span>
          <b>ready</b>
        </summary>
        <p className="empty-copy compact">Edit the outdoor level layout grid used when the party walks off a map edge. Blank cells mean no automatic edge travel, even when map art visually touches another level.</p>
        <div className="affordance-button-grid compact">
          <AffordanceButton label="Open Layout" body="Open the Divinity-style land adjacency grid. Layout cells point at land level indices and control edge-to-edge outdoor travel." tone="ready" onClick={onFocusLayout} />
        </div>
      </details>
      <details className="context-section affordance-section" open>
        <summary>
          <span>Random Rectangles</span>
          <b>{randomLevel?.rects.length ?? 0}/20{showRandomRects ? "" : " overlay off"}</b>
        </summary>
        <div className="affordance-button-grid compact">
          <AffordanceButton label="Set Rectangle" body="Use the Random Rectangle tool or selected-cell actions to create and resize a Random Rectangle. Realmz stores up to twenty per level." tone="ready" onClick={() => onSetTool("random")} />
          <AffordanceButton label="Highlight" body="Locate and highlight the first selected Random Rectangle on the map without changing its stored fields." tone="ready" onClick={onHighlightRandomRect} disabled={!randomLevel?.rects.length} />
          <AffordanceButton label="Show All" body="Show every Random Rectangle on the current level, including regions used for invisible encounters and extra Action Point doors." tone="ready" onClick={onShowRandomRects} />
          <AffordanceButton label="Edit Fields" body="Select a Random Rectangle to edit bounds, chance out of 10,000, battle range, text, sound, option byte, and extra AP doors." tone="ready" onClick={onEditRandomRect} disabled={!randomLevel?.rects.length} />
        </div>
        <div className="mini-rect-list">
          {randomLevel?.rects.map((rect) => (
            <button key={rect.rectIndex} className="mini-rect-row" type="button" onClick={() => onSelectRandomRect?.(rect.rectIndex)}>
              <strong>Rect {rect.rectIndex}</strong>
              <span>{rect.left},{rect.top} to {rect.right},{rect.bottom}</span>
              <small>{rect.percent} / 10000 | battles {rect.battleRange.join("-")}</small>
            </button>
          ))}
          {!randomLevel?.rects.length && <p className="empty-copy compact">No random rectangles on this level.</p>}
        </div>
      </details>
      {isDungeon && (
        <details className="context-section affordance-section" open>
          <summary>
            <span>Cell Flags</span>
            <b>edit</b>
          </summary>
          <p className="empty-copy compact">Select one dungeon cell or drag a region to edit wall, door, stair, column, unmapped, movement, and battle-wall flags.</p>
          <div className="affordance-button-grid compact">
            <AffordanceButton label="Map Entire Level" body="Clear the Unmapped flag from every dungeon cell." tone="ready" onClick={onMapEntireDungeon} disabled={!onMapEntireDungeon} />
            <AffordanceButton label="Unmap Entire Level" body="Set the Unmapped flag on every dungeon cell." tone="ready" onClick={onUnmapEntireDungeon} disabled={!onUnmapEntireDungeon} />
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
          <span><b>Right Drag</b> Pan canvas</span>
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
      <ReadOnlyField label="Times in 10,000" value={rect.percent} wide />
      <ReadOnlyField label="Battle Low" value={rect.battleRange[0]} />
      <ReadOnlyField label="Battle High" value={rect.battleRange[1]} />
      <ReadOnlyField label="% Option" value={rect.option} />
      <ReadOnlyField label="Text" value={rect.text} />
      {rect.randomDoors.map((door, index) => (
        <ReadOnlyField key={index} label={`Extra Action ${index + 1}`} value={`${door} @ ${doorPercentLabel(rect.randomDoorPercent[index])}`} />
      ))}
    </div>
  );
}

export function CellTileEvidence({ cell, records }: { cell: { x: number; y: number; tile: number }; records: SemanticEntity[] }) {
  const baseTile = normalizedTile(cell.tile);
  return (
    <div className="tile-evidence">
      <span><b>Base Tile</b>{baseTile}</span>
      <span><b>State Band</b>{cell.tile > 999 ? "positive" : "none"}</span>
      <span><b>Path Bit</b>{cell.tile > 0 && Boolean(cell.tile & 4) ? "yes" : "no"}</span>
      <span><b>Note Bit</b>{cell.tile > 0 && Boolean(cell.tile & 2) ? "yes" : "no"}</span>
      <span><b>Player Maps</b>{records.length}</span>
    </div>
  );
}

function doorPercentLabel(percent: number) {
  if (percent < 0) return `${Math.abs(percent)}% repeat`;
  if (percent > 0) return `${percent}% one-shot`;
  return "0%";
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
  return tool;
}

function normalizedTile(value: number) {
  let out = value;
  while (out > 999) out -= 1000;
  while (out < -999) out += 1000;
  return out;
}
