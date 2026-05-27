import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import { LibraryAsset, ManagedAsset, Project, SelectedEntity } from "./types";

export type ContentUsageLink = {
  key: string;
  label: string;
  detail: string;
  entity?: SelectedEntity;
};

export function classicTextByteLength(text: string) {
  return Array.from(text ?? "").length;
}

export function unsupportedClassicTextChars(text: string) {
  return Array.from(text ?? "").filter((char) => char.charCodeAt(0) > 0x7f);
}

export function messageUsageLinks(project: Project, messageId: number): ContentUsageLink[] {
  const links: ContentUsageLink[] = [];
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions ?? []) {
      const code = normalizeStepOpcode(action.rawCode);
      if (![1, 19, 62, 71].includes(code) || action.id !== messageId) continue;
      links.push({
        key: `script:${trigger.id}:${action.slot}`,
        label: triggerLabel(trigger),
        detail: `Action slot ${action.slot}: ${actionOptionFor(action.rawCode).label}`,
        entity: { type: "trigger", id: trigger.id }
      });
    }
  }
  for (const battle of project.battles ?? []) {
    if (battle.messageBefore === messageId) {
      links.push({ key: `battle:${battle.id}:before`, label: `Battle ${battle.id}`, detail: "Before battle message", entity: { type: "battle", id: `battle:${battle.id}` } });
    }
    if (battle.messageAfter === messageId) {
      links.push({ key: `battle:${battle.id}:after`, label: `Battle ${battle.id}`, detail: "After battle message", entity: { type: "battle", id: `battle:${battle.id}` } });
    }
  }
  for (const encounter of project.simpleEncounters ?? []) {
    if (encounter.prompt === messageId) {
      links.push({ key: `simple:${encounter.id}:prompt`, label: `Simple Encounter ${encounter.id}`, detail: "Prompt message", entity: { type: "encounter", id: `encounter:simple:${encounter.id}` } });
    }
    for (const action of encounter.actions ?? []) {
      if ([1, 19, 62, 71].includes(normalizeStepOpcode(action.rawCode)) && action.id === messageId) {
        links.push({ key: `simple:${encounter.id}:action:${action.slot}`, label: `Simple Encounter ${encounter.id}`, detail: `Action row ${action.slot} message`, entity: { type: "encounter", id: `encounter:simple:${encounter.id}` } });
      }
    }
  }
  for (const encounter of project.complexEncounters ?? []) {
    if (encounter.prompt === messageId) {
      links.push({ key: `complex:${encounter.id}:prompt`, label: `Complex Encounter ${encounter.id}`, detail: "Prompt message", entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
    }
    for (const action of encounter.actions ?? []) {
      if ([1, 19, 62, 71].includes(normalizeStepOpcode(action.rawCode)) && action.id === messageId) {
        links.push({ key: `complex:${encounter.id}:action:${action.slot}`, label: `Complex Encounter ${encounter.id}`, detail: `Action row ${action.slot} message`, entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
      }
    }
  }
  for (const level of project.randomLevels ?? []) {
    for (const rect of level.rects ?? []) {
      if (rect.text === messageId) {
        links.push({
          key: `random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}:text`,
          label: `${level.levelType} ${level.levelIndex} random area ${rect.rectIndex}`,
          detail: "Random-area text",
          entity: { type: "encounter", id: `random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}` }
        });
      }
    }
  }
  return links;
}

export function resourceUsageLinks(project: Project, resourceType: string | null | undefined, resourceId: number | null | undefined): ContentUsageLink[] {
  if (resourceId == null) return [];
  const type = (resourceType ?? "").trim();
  const links: ContentUsageLink[] = [];
  if (type === "snd") {
    for (const trigger of project.triggers ?? []) {
      for (const action of trigger.actions ?? []) {
        if (normalizeStepOpcode(action.rawCode) === 9 && action.id === resourceId) {
          links.push({ key: `sound-script:${trigger.id}:${action.slot}`, label: triggerLabel(trigger), detail: `Action slot ${action.slot} sound`, entity: { type: "trigger", id: trigger.id } });
        }
      }
    }
    for (const level of project.randomLevels ?? []) {
      for (const rect of level.rects ?? []) {
        if (rect.sound === resourceId) {
          links.push({ key: `sound-random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}`, label: `${level.levelType} ${level.levelIndex} random area ${rect.rectIndex}`, detail: "Random-area sound" });
        }
      }
    }
    for (const spell of project.spellOverrides ?? []) {
      if (spell.sound1 === resourceId || spell.sound2 === resourceId) {
        links.push({ key: `sound-spell:${spell.id}`, label: `Spell ${spell.id}`, detail: "Spell casting/resolution sound", entity: { type: "record", id: `spell:${spell.id}` } });
      }
    }
  }
  if (type === "PICT") {
    for (const trigger of project.triggers ?? []) {
      for (const action of trigger.actions ?? []) {
        if (normalizeStepOpcode(action.rawCode) === 27 && action.id === resourceId) {
          links.push({ key: `picture-script:${trigger.id}:${action.slot}`, label: triggerLabel(trigger), detail: `Action slot ${action.slot} picture`, entity: { type: "trigger", id: trigger.id } });
        }
      }
    }
    for (const record of project.mapRecords ?? []) {
      if (record.pictId === resourceId) {
        links.push({ key: `picture-map-record:${record.id}`, label: record.name ?? `Map Record ${record.id}`, detail: "Map record picture", entity: { type: "record", id: `map-record:${record.id}` } });
      }
    }
  }
  if (type === "cicn") {
    for (const map of project.maps ?? []) {
      const count = map.tiles.filter((tile) => tileMatchesCicn(tile, resourceId)).length;
      if (count > 0) {
        links.push({ key: `icon-map:${map.id}`, label: map.name, detail: `${count.toLocaleString()} tile${count === 1 ? "" : "s"} on map`, entity: { type: "map", id: `map:${map.levelType}:${map.index}` } });
      }
    }
    for (const spell of project.spellOverrides ?? []) {
      if ([spell.spellLook1, spell.spellLook2, spell.queueIcon].includes(resourceId)) {
        links.push({ key: `icon-spell:${spell.id}`, label: `Spell ${spell.id}`, detail: "Spell presentation icon", entity: { type: "record", id: `spell:${spell.id}` } });
      }
    }
    for (const race of project.raceOverrides ?? []) {
      if (race.defaultIconSet === resourceId) {
        links.push({ key: `icon-race:${race.id}`, label: race.displayName ?? `Race ${race.id}`, detail: "Race portrait set", entity: { type: "record", id: `race:${race.id}` } });
      }
    }
    for (const caste of project.casteOverrides ?? []) {
      if (caste.defaultIcon === resourceId) {
        links.push({ key: `icon-caste:${caste.id}`, label: caste.displayName ?? `Caste ${caste.id}`, detail: "Caste icon", entity: { type: "record", id: `caste:${caste.id}` } });
      }
    }
  }
  return links;
}

export function assetOriginLabel(asset: ManagedAsset | LibraryAsset) {
  if ("exportState" in asset) return "Project";
  return "Library";
}

function triggerLabel(trigger: Project["triggers"][number]) {
  if (trigger.levelType != null && trigger.levelIndex != null && trigger.coordinate) {
    return `${trigger.levelType} ${trigger.levelIndex} Action Point ${trigger.recordIndex}`;
  }
  if (trigger.source === "Data ED3") return `Macro ${trigger.recordIndex}`;
  return `Action Point ${trigger.recordIndex}`;
}

function tileMatchesCicn(tile: number, resourceId: number) {
  if (tile === resourceId) return true;
  if (tile === -resourceId) return true;
  if (tile < 0 && Math.abs(tile) === Math.abs(resourceId)) return true;
  if (tile < 0 && resourceId < 0 && Math.abs(tile + 1000) === Math.abs(resourceId + 1000)) return true;
  return false;
}
