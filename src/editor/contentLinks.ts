import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import { racePortraitSetFirstIconId, spellAnimationFrameIds, spellSoundResourceId } from "./resourceIds";
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
      if (![1, 62, 71].includes(code) || action.id !== messageId) continue;
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
      if ([1, 62, 71].includes(normalizeStepOpcode(action.rawCode)) && action.id === messageId) {
        links.push({ key: `simple:${encounter.id}:action:${action.slot}`, label: `Simple Encounter ${encounter.id}`, detail: `Action row ${action.slot} message`, entity: { type: "encounter", id: `encounter:simple:${encounter.id}` } });
      }
    }
  }
  for (const encounter of project.complexEncounters ?? []) {
    if (encounter.prompt === messageId) {
      links.push({ key: `complex:${encounter.id}:prompt`, label: `Complex Encounter ${encounter.id}`, detail: "Prompt message", entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
    }
    for (const action of encounter.actions ?? []) {
      if ([1, 62, 71].includes(normalizeStepOpcode(action.rawCode)) && action.id === messageId) {
        links.push({ key: `complex:${encounter.id}:action:${action.slot}`, label: `Complex Encounter ${encounter.id}`, detail: `Action row ${action.slot} message`, entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
      }
    }
  }
  links.push(...edcdMessageUsageLinks(project, messageId));
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
    links.push(...directSoundUsageLinks(project, resourceId));
    links.push(...edcdSoundUsageLinks(project, resourceId));
    for (const level of project.randomLevels ?? []) {
      for (const rect of level.rects ?? []) {
        if (rect.sound === resourceId) {
          links.push({ key: `sound-random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}`, label: `${level.levelType} ${level.levelIndex} random area ${rect.rectIndex}`, detail: "Random-area sound" });
        }
      }
    }
    for (const spell of project.spellOverrides ?? []) {
      if (spellSoundResourceId(spell.sound1) === resourceId || spellSoundResourceId(spell.sound2) === resourceId) {
        links.push({ key: `sound-spell:${spell.id}`, label: `Spell ${spell.id}`, detail: "Spell casting/resolution sound", entity: { type: "record", id: `spell:${spell.id}` } });
      }
    }
  }
  if (type === "PICT") {
    links.push(...directPictureUsageLinks(project, resourceId));
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
    links.push(...edcdCicnUsageLinks(project, resourceId));
    for (const spell of project.spellOverrides ?? []) {
      const castFrames = spellAnimationFrameIds(spell.spellLook1, "blank-cast");
      const resolutionFrames = spellAnimationFrameIds(spell.spellLook2, "default-resolution");
      if (castFrames.includes(resourceId) || resolutionFrames.includes(resourceId)) {
        links.push({ key: `icon-spell:${spell.id}`, label: `Spell ${spell.id}`, detail: "Spell presentation icon", entity: { type: "record", id: `spell:${spell.id}` } });
      }
    }
    for (const race of project.raceOverrides ?? []) {
      const firstIcon = racePortraitSetFirstIconId(race.defaultIconSet);
      if (resourceId >= firstIcon && resourceId < firstIcon + 6) {
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

type ScriptActionLike = {
  slot: number;
  rawCode: number;
  id: number;
};

type ScriptActionUsageContext = {
  key: string;
  label: string;
  actionLabel: string;
  entity?: SelectedEntity;
};

type EdcdUsageTarget = {
  fieldIndex: number;
  value: number;
  label: string;
};

function edcdMessageUsageLinks(project: Project, messageId: number) {
  const links: ContentUsageLink[] = [];
  const rows = edcdRowsById(project);
  forEachScriptAction(project, (action, context) => {
    const code = normalizeStepOpcode(action.rawCode);
    if (!actionOptionFor(action.rawCode).edcdShape) return;
    const row = rows.get(edcdRowId(action));
    if (!row) return;
    for (const target of edcdMessageTargets(code, row.values)) {
      if (target.value !== messageId) continue;
      links.push({
        key: `${context.key}:edcd-message:${target.fieldIndex}`,
        label: context.label,
        detail: `${context.actionLabel}: ${target.label}`,
        entity: context.entity
      });
    }
  });
  return links;
}

function directSoundUsageLinks(project: Project, resourceId: number) {
  const links: ContentUsageLink[] = [];
  forEachScriptAction(project, (action, context) => {
    if (normalizeStepOpcode(action.rawCode) !== 9 || action.id !== resourceId) return;
    links.push({
      key: `${context.key}:sound`,
      label: context.label,
      detail: `${context.actionLabel}: sound`,
      entity: context.entity
    });
  });
  return links;
}

function directPictureUsageLinks(project: Project, resourceId: number) {
  const links: ContentUsageLink[] = [];
  forEachScriptAction(project, (action, context) => {
    if (normalizeStepOpcode(action.rawCode) !== 27 || action.id !== resourceId) return;
    links.push({
      key: `${context.key}:picture`,
      label: context.label,
      detail: `${context.actionLabel}: picture`,
      entity: context.entity
    });
  });
  return links;
}

function edcdSoundUsageLinks(project: Project, resourceId: number) {
  const links: ContentUsageLink[] = [];
  const rows = edcdRowsById(project);
  forEachScriptAction(project, (action, context) => {
    const code = normalizeStepOpcode(action.rawCode);
    if (!actionOptionFor(action.rawCode).edcdShape) return;
    const row = rows.get(edcdRowId(action));
    if (!row) return;
    for (const target of edcdSoundTargets(code, row.values)) {
      if (target.value !== resourceId) continue;
      links.push({
        key: `${context.key}:edcd-sound:${target.fieldIndex}`,
        label: context.label,
        detail: `${context.actionLabel}: ${target.label}`,
        entity: context.entity
      });
    }
  });
  return links;
}

function edcdCicnUsageLinks(project: Project, resourceId: number) {
  const links: ContentUsageLink[] = [];
  const rows = edcdRowsById(project);
  forEachScriptAction(project, (action, context) => {
    const code = normalizeStepOpcode(action.rawCode);
    if (code !== 120 || !actionOptionFor(action.rawCode).edcdShape) return;
    const row = rows.get(edcdRowId(action));
    const icon = row?.values[3] ?? 0;
    if (icon !== resourceId) return;
    links.push({
      key: `${context.key}:edcd-icon:3`,
      label: context.label,
      detail: `${context.actionLabel}: replacement monster icon`,
      entity: context.entity
    });
  });
  return links;
}

function forEachScriptAction(project: Project, visit: (action: ScriptActionLike, context: ScriptActionUsageContext) => void) {
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions ?? []) {
      visit(action, {
        key: `script:${trigger.id}:${action.slot}`,
        label: triggerLabel(trigger),
        actionLabel: `Action slot ${action.slot}`,
        entity: { type: "trigger", id: trigger.id }
      });
    }
  }
  for (const encounter of project.simpleEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      visit(action, {
        key: `simple:${encounter.id}:action:${action.slot}`,
        label: `Simple Encounter ${encounter.id}`,
        actionLabel: `Action row ${action.slot}`,
        entity: { type: "encounter", id: `encounter:simple:${encounter.id}` }
      });
    }
  }
  for (const encounter of project.complexEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      visit(action, {
        key: `complex:${encounter.id}:action:${action.slot}`,
        label: `Complex Encounter ${encounter.id}`,
        actionLabel: `Action row ${action.slot}`,
        entity: { type: "encounter", id: `encounter:complex:${encounter.id}` }
      });
    }
  }
}

function edcdRowsById(project: Project) {
  return new Map((project.extracodes ?? []).map((row) => [row.id, row]));
}

function edcdRowId(action: ScriptActionLike) {
  return Math.max(0, action.id);
}

function edcdMessageTargets(code: number, values: number[]): EdcdUsageTarget[] {
  const value = (index: number) => values[index] ?? 0;
  const targets: EdcdUsageTarget[] = [];
  const add = (fieldIndex: number, label: string, rawValue = value(fieldIndex)) => {
    const id = code === 15 || code === 16 ? Math.abs(rawValue) : rawValue;
    if (id > 0) targets.push({ fieldIndex, value: id, label });
  };

  if (code === 2 || code === 48 || code === 107) add(3, "battle message");
  else if (code === 56) add(4, "battle message");
  else if (code === 3) {
    add(3, "choice prompt A");
    add(4, "choice prompt B");
  } else if (code === 15 || code === 16) add(4, "damage/heal message");
  else if (code === 19) {
    add(0, "random message range start");
    add(1, "random message range end");
  } else if (code === 20 || code === 45) add(4, "teleport message");
  else if (code === 21 && value(2) === 2) add(4, "missing-item message");
  else if (code === 55 && value(1) === 2) add(4, "no-selection message");
  else if (code === 74) add(4, "spell-points message");
  else if (code === 85) add(4, "random-branch message");
  else if (code === 87 && value(2) === 2) add(4, "missing-ally message");
  else if (code === 122) add(0, "fumble message");

  return targets;
}

function edcdSoundTargets(code: number, values: number[]): EdcdUsageTarget[] {
  const value = (index: number) => values[index] ?? 0;
  const targets: EdcdUsageTarget[] = [];
  const add = (fieldIndex: number, label: string) => {
    const id = value(fieldIndex);
    if (id !== 0) targets.push({ fieldIndex, value: id, label });
  };

  if ((code === 2 && value(4) !== 10) || code === 48 || code === 107) add(2, "battle sound");
  else if (code === 56) add(3, "battle sound");
  else if (code === 15 || code === 16) add(3, "damage/heal sound");
  else if (code === 20 || code === 45) add(3, "teleport sound");
  else if (code === 43) add(3, "condition sound");
  else if (code === 74 && value(3) !== 0) add(1, "spell-points sound");
  else if (code === 85) add(3, "random-branch sound");
  else if (code === 122) add(1, "fumble sound");
  else if (code === 124) add(3, "spawn sound");

  return targets;
}

export function assetOriginLabel(asset: ManagedAsset | LibraryAsset) {
  if ("exportState" in asset) return "Scenario";
  const text = `${asset.source} ${asset.relativePath} ${asset.label} ${asset.type}`.toLowerCase();
  if (/\b(ui|interface|manual|documentation|screenshot|button|window)\b/.test(text)) return "UI Reference";
  if (text.includes("divinity") && !text.includes("realmz data")) return "Divinity Reference";
  return "Realmz Library";
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
