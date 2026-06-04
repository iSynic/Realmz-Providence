import { useEffect, useState } from "react";
import { EditorTool, MapEntity, MapViewFlag, MapWorkbenchMode, ProjectCommand, RandomLevel, SelectedEntity } from "../../types";
import { randomRectEntityId } from "../../map/geometry";
import { InfoGrid } from "../InfoGrid";
import { TutorialTip } from "../TutorialTip";
import { RandomRectangleForm } from "../MapAffordances";
import { MapDiagnostics, MapNumberField } from "./MapFormControls";

const RANDOM_AREAS_HELP =
  "Random Encounter Areas are Realmz random-rectangle records for the selected land or dungeon level. They combine map bounds, chance, battle ranges, text/sound hints, and optional Extra Action Point door calls.";
const RANDOM_PRIORITY_HELP =
  "Realmz checks random rectangle slots from 19 down to 0. Higher-numbered active rectangles win when regions overlap, so the slot number is part of the encounter design.";
const RANDOM_CANVAS_HELP =
  "Switch back to the map canvas with random rectangles visible and the Random tool active so you can draw or resize regions spatially.";
const SHOW_ALL_RECTS_HELP =
  "Turn on the random-rectangle overlay for the selected map. This makes all active random areas visible without changing their records.";
const RANDOM_SLOT_HELP =
  "Empty slots are reusable. Creating one writes a default rectangle that you can resize here or by using the Random tool on the canvas.";
const SHOW_RECT_HELP =
  "Show this rectangle on the map canvas by enabling the random overlay and selecting the corresponding encounter entity.";
const RECT_BOUNDS_HELP =
  "Rectangle bounds are inclusive 0..89 map coordinates. Left/Top mark one corner, Right/Bottom mark the opposite corner.";
const RECT_CHANCE_HELP =
  "Realmz stores random encounter chance as Times in 10,000. For example, 1000 is roughly ten percent before other runtime checks.";
const BATTLE_RANGE_HELP =
  "Battle Low and Battle High select the inclusive Data BD battle record range Realmz can choose from when this random rectangle fires.";
const RANDOM_OPTION_HELP =
  "Imported option byte for this random rectangle. Keep it visible for compatibility; edit only when you know the scenario's legacy behavior.";
const RANDOM_SOUND_TEXT_HELP =
  "Optional sound and text IDs associated with this random rectangle. They are source-backed numeric links, not free-form labels.";
const RANDOM_ONLY_HELP =
  "Only this rectangle can fire marks the record as exclusive in the imported data. Use it sparingly because it can suppress other random areas for the level.";
const RANDOM_DOORS_HELP =
  "Each random rectangle can call up to three Extra Action Point door paths. Positive percent means a one-shot chance; negative percent means a repeatable chance.";
const CLEAR_RANDOM_RECT_HELP =
  "Clear this slot from the random-level record. The slot number remains reusable, but this rectangle no longer participates in Realmz random encounter checks.";

export function RandomAreasWorkbench({
  selectedMap,
  randomLevel,
  onSetWorkbenchMode,
  onSetViewFlag,
  onSetTool,
  onSelectEntity,
  onApplyCommand
}: {
  selectedMap: MapEntity | null;
  randomLevel: RandomLevel | null;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const rects = randomLevel?.rects ?? [];
  const activeRectIndexes = new Set(rects.map((rect) => rect.rectIndex));
  const orderedSlots = Array.from({ length: 20 }, (_, index) => 19 - index);
  const [selectedRectIndex, setSelectedRectIndex] = useState(() => rects[0]?.rectIndex ?? 19);
  const rectIndexKey = rects.map((rect) => rect.rectIndex).join(",");
  useEffect(() => {
    if (!activeRectIndexes.has(selectedRectIndex)) setSelectedRectIndex(rects[0]?.rectIndex ?? 19);
  }, [rectIndexKey, selectedRectIndex]);
  if (!selectedMap) return <p className="empty-copy compact">Select a map to edit random areas.</p>;
  const selectedRect = rects.find((rect) => rect.rectIndex === selectedRectIndex) ?? null;
  const overlapWarnings = randomRectOverlapWarnings(rects);
  const selectOnCanvas = (rectIndex: number) => {
    onSetViewFlag("showRandomRects", true);
    onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, rectIndex) });
  };
  const createSelected = () => {
    onApplyCommand({
      kind: "createRandomRect",
      label: `Create Random Rectangle ${selectedRectIndex}`,
      levelType: selectedMap.levelType,
      levelIndex: selectedMap.index,
      rect: {
        rectIndex: selectedRectIndex,
        left: 0,
        top: 0,
        right: 4,
        bottom: 4,
        percent: 1000,
        battleRange: [0, 0],
        randomDoors: [0, 0, 0],
        randomDoorPercent: [0, 0, 0],
        only: false,
        option: 0,
        sound: 0,
        text: 0
      }
    });
  };
  return (
    <div className="random-areas-workbench">
      <p className="empty-copy compact">
        <TutorialTip title="Random Encounter Areas" body={RANDOM_AREAS_HELP} side="below">
          <span>Author random encounter rectangles for the selected map. Higher slots have priority when regions overlap.</span>
        </TutorialTip>
      </p>
      <div className="random-areas-toolbar">
        <InfoGrid
          rows={[
            ["Map", selectedMap.name],
            ["Active Rectangles", `${rects.length} / 20`],
            ["Priority", "Realmz checks 19 down to 0"],
            ["Record Type", selectedMap.levelType === "land" ? "Land random encounters" : "Dungeon random encounters"]
          ]}
        />
        <div className="context-action-stack compact">
          <TutorialTip title="Random Rectangle Priority" body={RANDOM_PRIORITY_HELP} side="below">
            <span className="map-help-anchor random-priority-anchor">Priority 19 down to 0</span>
          </TutorialTip>
          <TutorialTip title="Draw Random Areas" body={RANDOM_CANVAS_HELP} side="below">
            <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => {
              onSetWorkbenchMode("canvas");
              onSetViewFlag("showRandomRects", true);
              onSetTool("random");
            }}>
              Draw On Canvas
            </button>
          </TutorialTip>
          <TutorialTip title="Show Random Areas" body={SHOW_ALL_RECTS_HELP} side="below">
            <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetViewFlag("showRandomRects", true)}>
              Show All On Map
            </button>
          </TutorialTip>
        </div>
      </div>
      <div className="random-areas-layout">
        <div className="random-areas-list" role="list" aria-label="Random rectangle priority slots">
          {orderedSlots.map((rectIndex) => {
            const rect = rects.find((candidate) => candidate.rectIndex === rectIndex);
            const warnings = overlapWarnings.get(rectIndex) ?? [];
            return (
              <button
                key={rectIndex}
                type="button"
                className={[
                  "random-area-row",
                  selectedRectIndex === rectIndex ? "selected" : "",
                  rect ? "active" : "empty"
                ].filter(Boolean).join(" ")}
                onClick={() => setSelectedRectIndex(rectIndex)}
              >
                <span>
                  <b>Rect {rectIndex}</b>
                  <small>{rect ? rectSummary(rect) : "Reusable slot"}</small>
                </span>
                <em>{rect ? `${rect.percent} / 10000` : "empty"}</em>
                {warnings.length > 0 && <strong>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong>}
              </button>
            );
          })}
        </div>
        <div className="random-area-detail">
          <div className="panel-header compact">
            <TutorialTip title="Random Rectangle Slot" body={selectedRect ? RANDOM_PRIORITY_HELP : RANDOM_SLOT_HELP} side="below">
              <span>Random Rectangle {selectedRectIndex}</span>
            </TutorialTip>
            <TutorialTip title="Show Rectangle On Canvas" body={SHOW_RECT_HELP} side="below">
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => selectOnCanvas(selectedRectIndex)} disabled={!activeRectIndexes.has(selectedRectIndex)}>
                Show On Canvas
              </button>
            </TutorialTip>
          </div>
          {selectedRect ? (
            <>
              {(overlapWarnings.get(selectedRect.rectIndex) ?? []).length > 0 && (
                <MapDiagnostics diagnostics={overlapWarnings.get(selectedRect.rectIndex) ?? []} />
              )}
              <RandomRectangleEditor map={selectedMap} rect={selectedRect} onApplyCommand={onApplyCommand} />
            </>
          ) : (
            <div className="map-mode-placeholder compact">
              <strong>Reusable Random Rectangle Slot</strong>
              <p>This slot is empty. Creating it adds a small default rectangle that you can resize here or on the canvas.</p>
              <TutorialTip title="Create Random Rectangle" body={RANDOM_SLOT_HELP} side="below">
                <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={createSelected}>Create Rectangle {selectedRectIndex}</button>
              </TutorialTip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RandomRectangleEditor({
  map,
  rect,
  onApplyCommand
}: {
  map: MapEntity | null;
  rect: RandomLevel["rects"][number];
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  if (!map) return null;
  const update = (fields: Partial<Omit<RandomLevel["rects"][number], "rectIndex">>) => {
    onApplyCommand({
      kind: "updateRandomRect",
      label: `Update Random Rectangle ${rect.rectIndex}`,
      levelType: map.levelType,
      levelIndex: map.index,
      rectIndex: rect.rectIndex,
      fields
    });
  };
  const updateDoor = (index: number, value: number) => {
    const randomDoors = [rect.randomDoors[0] ?? 0, rect.randomDoors[1] ?? 0, rect.randomDoors[2] ?? 0];
    randomDoors[index] = value;
    update({ randomDoors });
  };
  const updateDoorPercent = (index: number, value: number) => {
    const randomDoorPercent = [rect.randomDoorPercent[0] ?? 0, rect.randomDoorPercent[1] ?? 0, rect.randomDoorPercent[2] ?? 0];
    randomDoorPercent[index] = value;
    update({ randomDoorPercent });
  };
  return (
    <div className="map-random-editor">
      <InfoGrid
        rows={[
          ["Rectangle", rect.rectIndex],
          ["Edit State", "Realmz-writable"],
          ["Record Type", map.levelType === "land" ? "Land random encounters" : "Dungeon random encounters"]
        ]}
      />
      <MapDiagnostics diagnostics={randomRectDiagnostics(rect)} />
      <div className="map-authoring-form">
        <MapNumberField label="Left" value={rect.left} min={0} max={89} help={RECT_BOUNDS_HELP} onCommit={(left) => update({ left })} />
        <MapNumberField label="Top" value={rect.top} min={0} max={89} help={RECT_BOUNDS_HELP} onCommit={(top) => update({ top })} />
        <MapNumberField label="Right" value={rect.right} min={0} max={89} help={RECT_BOUNDS_HELP} onCommit={(right) => update({ right })} />
        <MapNumberField label="Bottom" value={rect.bottom} min={0} max={89} help={RECT_BOUNDS_HELP} onCommit={(bottom) => update({ bottom })} />
        <MapNumberField label="Times in 10,000" value={rect.percent} min={0} max={10000} help={RECT_CHANCE_HELP} onCommit={(percent) => update({ percent })} />
        <MapNumberField label="Battle Low" value={rect.battleRange[0] ?? 0} help={BATTLE_RANGE_HELP} onCommit={(value) => update({ battleRange: [value, rect.battleRange[1] ?? value] })} />
        <MapNumberField label="Battle High" value={rect.battleRange[1] ?? 0} help={BATTLE_RANGE_HELP} onCommit={(value) => update({ battleRange: [rect.battleRange[0] ?? value, value] })} />
        <MapNumberField label="Option" value={rect.option} min={-128} max={127} help={RANDOM_OPTION_HELP} onCommit={(option) => update({ option })} />
        <MapNumberField label="Sound" value={rect.sound} help={RANDOM_SOUND_TEXT_HELP} onCommit={(sound) => update({ sound })} />
        <MapNumberField label="Text" value={rect.text} help={RANDOM_SOUND_TEXT_HELP} onCommit={(text) => update({ text })} />
        <label className="map-check-field">
          <input type="checkbox" checked={rect.only} onChange={(event) => update({ only: event.currentTarget.checked })} />
          <TutorialTip title="Exclusive Random Rectangle" body={RANDOM_ONLY_HELP} side="right">
            <span>Only this rectangle can fire</span>
          </TutorialTip>
        </label>
      </div>
      <details className="context-section" open>
        <summary>
          <TutorialTip title="Extra Action Point Doors" body={RANDOM_DOORS_HELP} side="below">
            <span>Extra Action Point Doors</span>
          </TutorialTip>
          <b>3</b>
        </summary>
        <div className="map-authoring-form">
          {[0, 1, 2].map((index) => (
            <div className="map-door-pair" key={index}>
              <MapNumberField label={`Door ${index + 1}`} value={rect.randomDoors[index] ?? 0} help={RANDOM_DOORS_HELP} onCommit={(value) => updateDoor(index, value)} />
              <MapNumberField label={`Door ${index + 1} %`} value={rect.randomDoorPercent[index] ?? 0} min={-100} max={100} help={RANDOM_DOORS_HELP} onCommit={(value) => updateDoorPercent(index, value)} />
              <small className="context-capacity-note compact">{randomDoorPercentMeaning(rect.randomDoorPercent[index] ?? 0)}</small>
            </div>
          ))}
        </div>
      </details>
      <TutorialTip title="Clear Random Rectangle" body={CLEAR_RANDOM_RECT_HELP} side="below">
        <button
          className="btn btn-ghost btn-xs context-action-button"
          type="button"
          onClick={() => onApplyCommand({ kind: "clearRandomRect", label: `Clear Random Rectangle ${rect.rectIndex}`, levelType: map.levelType, levelIndex: map.index, rectIndex: rect.rectIndex })}
        >
          Clear Random Rectangle
        </button>
      </TutorialTip>
      <details className="context-section">
        <summary><span>Technical Details</span><b>preserved bytes</b></summary>
        <RandomRectangleForm rect={rect} />
      </details>
    </div>
  );
}

export function randomRectDiagnostics(rect: RandomLevel["rects"][number]) {
  const diagnostics: string[] = [];
  if (rect.left < 0 || rect.top < 0 || rect.right > 89 || rect.bottom > 89) diagnostics.push("Bounds are outside the 90x90 map.");
  if (rect.left > rect.right || rect.top > rect.bottom) diagnostics.push("Bounds are inverted.");
  if (rect.percent > 10000) diagnostics.push("Times in 10,000 must not exceed 10000.");
  if (rect.percent < 0) diagnostics.push("Negative Times in 10,000 was imported from the scenario, but normal authoring should use 0..10000.");
  rect.randomDoorPercent.forEach((percent, index) => {
    if (percent < -100 || percent > 100) diagnostics.push(`Door ${index + 1} percent must be between -100 and 100.`);
  });
  if (rect.percent === 0 && rect.randomDoors.every((door) => door === 0)) diagnostics.push("Rectangle is effectively inactive.");
  return diagnostics;
}

function randomDoorPercentMeaning(percent: number) {
  if (percent < 0) return `${Math.abs(percent)}% repeat door path`;
  if (percent > 0) return `${percent}% one-shot door path`;
  return "No extra AP chance.";
}

function rectSummary(rect: RandomLevel["rects"][number]) {
  return `${rect.left},${rect.top} to ${rect.right},${rect.bottom} | battles ${rect.battleRange[0]}-${rect.battleRange[1]}`;
}

function randomRectOverlapWarnings(rects: RandomLevel["rects"]) {
  const warnings = new Map<number, string[]>();
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      const first = rects[a];
      const second = rects[b];
      if (!rectanglesOverlap(first, second)) continue;
      const higher = first.rectIndex > second.rectIndex ? first : second;
      const lower = higher === first ? second : first;
      const message = `Overlaps rectangle ${higher === first ? second.rectIndex : first.rectIndex}; rectangle ${higher.rectIndex} has priority over ${lower.rectIndex}.`;
      warnings.set(first.rectIndex, [...(warnings.get(first.rectIndex) ?? []), message]);
      warnings.set(second.rectIndex, [...(warnings.get(second.rectIndex) ?? []), message]);
    }
  }
  return warnings;
}

function rectanglesOverlap(a: RandomLevel["rects"][number], b: RandomLevel["rects"][number]) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
