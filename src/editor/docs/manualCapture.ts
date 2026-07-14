import type { EditorAction } from "../store";
import type { Project } from "../types";
import { selectEntityFromId, triggerEntityId } from "../utils";

export const MANUAL_CAPTURE_PRESET_IDS = [
  "workspace",
  "scenario",
  "maps",
  "player-maps",
  "scripts",
  "text",
  "encounters",
  "combat",
  "economy",
  "rules",
  "assets",
  "linter",
  "export"
] as const;

export type ManualCapturePresetId = (typeof MANUAL_CAPTURE_PRESET_IDS)[number];

export function isManualCapturePresetId(value: string | null): value is ManualCapturePresetId {
  return Boolean(value && (MANUAL_CAPTURE_PRESET_IDS as readonly string[]).includes(value));
}

export function manualCaptureActions(project: Project, preset: ManualCapturePresetId): EditorAction[] {
  const actions: EditorAction[] = [
    { type: "setWorkbench", workbench: "project" },
    { type: "setTutorialEnabled", enabled: false }
  ];
  if (preset === "workspace") return [...actions, { type: "setActiveEditor", editor: "hub" }];

  const tab = preset === "encounters" ? "encounters" : preset;
  actions.push({ type: "setActiveEditor", editor: editorForPreset(preset) });
  actions.push({ type: "setTab", tab });

  const entityId = selectedEntityId(project, preset);
  if (entityId) actions.push({ type: "selectEntity", entity: selectEntityFromId(entityId) });
  if (preset === "maps" && project.maps[0]) {
    actions.push({ type: "setSelectedMap", id: project.maps[0].id });
    actions.push({ type: "setTool", tool: "select" });
  }
  return actions;
}

function editorForPreset(preset: ManualCapturePresetId) {
  if (preset === "scripts") return "action-points";
  if (preset === "text") return "messages";
  if (preset === "encounters") return "complex";
  if (preset === "combat") return "battles";
  if (preset === "economy") return "treasure";
  if (preset === "rules") return "castes";
  if (preset === "assets") return "project-assets";
  if (preset === "linter") return "issues";
  if (preset === "export") return "export-plan";
  if (preset === "player-maps") return "map-records";
  return "domain";
}

function selectedEntityId(project: Project, preset: ManualCapturePresetId): string | null {
  if (preset === "maps") return project.maps[0] ? `map:${project.maps[0].levelType}:${project.maps[0].index}` : null;
  if (preset === "player-maps") return project.mapRecords[0] ? `map-record:${project.mapRecords[0].id}` : null;
  if (preset === "scripts") {
    const trigger = project.triggers.find((candidate) => candidate.source !== "Data ED3" && candidate.actions.some((action) => action.code !== 0))
      ?? project.triggers.find((candidate) => candidate.source !== "Data ED3")
      ?? null;
    return trigger ? triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source) : null;
  }
  if (preset === "text") {
    const message = project.messages.find((candidate) => candidate.id > 0 && candidate.text.trim().length > 0) ?? project.messages[0];
    return message ? `message:${message.id}` : null;
  }
  if (preset === "encounters") return project.complexEncounters[0] ? `encounter:complex:${project.complexEncounters[0].id}` : null;
  if (preset === "combat") {
    const battle = project.battles.find((candidate) => candidate.grid.some((monsterId) => monsterId !== 0)) ?? project.battles[0];
    return battle ? `battle:${battle.id}` : null;
  }
  if (preset === "economy") {
    const treasure = project.treasures.find((candidate) => candidate.itemIds.some(Boolean) || candidate.gold || candidate.gems || candidate.jewelry || candidate.exp)
      ?? project.treasures[0];
    return treasure ? `treasure:${treasure.id}` : null;
  }
  if (preset === "rules") return project.casteOverrides[0] ? `rule-caste:${project.casteOverrides[0].id}` : null;
  return null;
}
