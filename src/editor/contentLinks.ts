import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import { racePortraitSetFirstIconId, spellAnimationFrameIds, spellSoundResourceId } from "./resourceIds";
import { ruleCasteName, ruleRaceName } from "./ruleNames";
import { LibraryAsset, ManagedAsset, Project, SelectedEntity } from "./types";

export type ContentUsageLink = {
  key: string;
  label: string;
  detail: string;
  entity?: SelectedEntity;
};

const emptyUsageLinks: ContentUsageLink[] = [];
type TextUsageIndex = {
  messageLinks: Map<number, ContentUsageLink[]>;
  optionLabelLinks: Map<number, ContentUsageLink[]>;
};
type ResourceUsageIndex = {
  mapCicnLinks: Map<number, ContentUsageLink[]>;
};

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const MAX_CONTENT_USAGE_CACHE_ENTRIES = 96;
const textUsageIndexes = new Map<string, TextUsageIndex>();
const resourceUsageIndexes = new Map<string, ResourceUsageIndex>();

export function classicTextByteLength(text: string) {
  return Array.from(text ?? "").length;
}

export function unsupportedClassicTextChars(text: string) {
  return Array.from(text ?? "").filter((char) => char.charCodeAt(0) > 0x7f);
}

export function messageUsageLinks(project: Project, messageId: number): ContentUsageLink[] {
  return textUsageIndex(project).messageLinks.get(messageId) ?? emptyUsageLinks;
}

export function optionLabelUsageLinks(project: Project, optionLabelId: number): ContentUsageLink[] {
  return textUsageIndex(project).optionLabelLinks.get(optionLabelId) ?? emptyUsageLinks;
}

function textUsageIndex(project: Project) {
  const cacheKey = textUsageDependencyKey(project);
  const cached = textUsageIndexes.get(cacheKey);
  if (cached) return cached;
  const index = {
    messageLinks: buildMessageUsageLinks(project),
    optionLabelLinks: buildOptionLabelUsageLinks(project)
  };
  writeLimitedCache(textUsageIndexes, cacheKey, index);
  return index;
}

function buildMessageUsageLinks(project: Project) {
  const links = new Map<number, ContentUsageLink[]>();
  const add = (messageId: number, link: ContentUsageLink) => {
    if (!Number.isFinite(messageId) || messageId <= 0) return;
    const existing = links.get(messageId);
    if (existing) {
      existing.push(link);
    } else {
      links.set(messageId, [link]);
    }
  };
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions ?? []) {
      const code = normalizeStepOpcode(action.rawCode);
      const targetMessageId = code === 1 ? Math.abs(action.id) : action.id;
      if (![1, 62, 71].includes(code)) continue;
      add(targetMessageId, {
        key: `script:${trigger.id}:${action.slot}`,
        label: triggerLabel(project, trigger),
        detail: `Action slot ${action.slot}: ${actionOptionFor(action.rawCode).label}`,
        entity: triggerUsageEntity(trigger)
      });
    }
  }
  for (const battle of project.battles ?? []) {
    add(battle.messageBefore, { key: `battle:${battle.id}:before`, label: `Battle ${battle.id}`, detail: "Before battle message", entity: { type: "battle", id: `battle:${battle.id}` } });
    add(battle.messageAfter, { key: `battle:${battle.id}:after`, label: `Battle ${battle.id}`, detail: "After battle message", entity: { type: "battle", id: `battle:${battle.id}` } });
  }
  for (const encounter of project.simpleEncounters ?? []) {
    add(encounter.prompt, { key: `simple:${encounter.id}:prompt`, label: `Simple Encounter ${encounter.id}`, detail: "Prompt message", entity: { type: "encounter", id: `encounter:simple:${encounter.id}` } });
    for (const action of encounter.actions ?? []) {
      const code = normalizeStepOpcode(action.rawCode);
      const targetMessageId = code === 1 ? Math.abs(action.id) : action.id;
      if ([1, 62, 71].includes(code)) {
        add(targetMessageId, { key: `simple:${encounter.id}:action:${action.slot}`, label: `Simple Encounter ${encounter.id}`, detail: `Action step ${action.slot} message`, entity: { type: "encounter", id: `encounter:simple:${encounter.id}` } });
      }
    }
  }
  for (const encounter of project.complexEncounters ?? []) {
    add(encounter.prompt, { key: `complex:${encounter.id}:prompt`, label: `Complex Encounter ${encounter.id}`, detail: "Prompt message", entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
    for (const action of encounter.actions ?? []) {
      const code = normalizeStepOpcode(action.rawCode);
      const targetMessageId = code === 1 ? Math.abs(action.id) : action.id;
      if ([1, 62, 71].includes(code)) {
        add(targetMessageId, { key: `complex:${encounter.id}:action:${action.slot}`, label: `Complex Encounter ${encounter.id}`, detail: `Action step ${action.slot} message`, entity: { type: "encounter", id: `encounter:complex:${encounter.id}` } });
      }
    }
  }
  const rows = edcdRowsById(project);
  forEachScriptAction(project, (action, context) => {
    const code = normalizeStepOpcode(action.rawCode);
    if (!actionOptionFor(action.rawCode).edcdShape) return;
    const row = rows.get(edcdRowId(action));
    if (!row) return;
    for (const target of edcdMessageTargets(code, row.values)) {
      add(target.value, {
        key: `${context.key}:edcd-message:${target.fieldIndex}`,
        label: context.label,
        detail: `${context.actionLabel}: ${target.label}`,
        entity: context.entity
      });
    }
  });
  for (const level of project.randomLevels ?? []) {
    for (const rect of level.rects ?? []) {
      add(rect.text, {
        key: `random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}:text`,
        label: `${level.levelType} ${level.levelIndex} random area ${rect.rectIndex}`,
        detail: "Random-area text",
        entity: { type: "encounter", id: `random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}` }
      });
    }
  }
  return links;
}

function buildOptionLabelUsageLinks(project: Project) {
  const links = new Map<number, ContentUsageLink[]>();
  const add = (optionLabelId: number, link: ContentUsageLink) => {
    if (!Number.isFinite(optionLabelId) || optionLabelId <= 0) return;
    const existing = links.get(optionLabelId);
    if (existing) {
      existing.push(link);
    } else {
      links.set(optionLabelId, [link]);
    }
  };
  const rows = edcdRowsById(project);
  forEachScriptAction(project, (action, context) => {
    const code = normalizeStepOpcode(action.rawCode);
    if (code !== 3 || !actionOptionFor(action.rawCode).edcdShape) return;
    const row = rows.get(edcdRowId(action));
    if (!row) return;
    const options = [
      { fieldIndex: 3, value: row.values[3] ?? 0, label: "Choice option A" },
      { fieldIndex: 4, value: row.values[4] ?? 0, label: "Choice option B" }
    ];
    for (const option of options) {
      if (option.value >= 0) continue;
      add(Math.abs(option.value), {
        key: `${context.key}:option-label:${option.fieldIndex}`,
        label: context.label,
        detail: `${context.actionLabel}: ${option.label}`,
        entity: context.entity
      });
    }
  });
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
    links.push(...(resourceUsageIndex(project).mapCicnLinks.get(resourceId) ?? []));
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
        links.push({ key: `icon-race:${race.id}`, label: ruleRaceName(project, race.id, race.displayName), detail: "Race portrait set", entity: { type: "record", id: `race:${race.id}` } });
      }
    }
    for (const caste of project.casteOverrides ?? []) {
      if (caste.defaultIcon === resourceId) {
        links.push({ key: `icon-caste:${caste.id}`, label: ruleCasteName(project, caste.id, caste.displayName), detail: "Caste icon", entity: { type: "record", id: `caste:${caste.id}` } });
      }
    }
  }
  return links;
}

function resourceUsageIndex(project: Project) {
  const cacheKey = resourceUsageDependencyKey(project);
  const cached = resourceUsageIndexes.get(cacheKey);
  if (cached) return cached;
  const index = {
    mapCicnLinks: buildMapCicnUsageLinks(project)
  };
  writeLimitedCache(resourceUsageIndexes, cacheKey, index);
  return index;
}

function textUsageDependencyKey(project: Project) {
  return [
    "triggers", objectCacheKey(project.triggers),
    "battles", objectCacheKey(project.battles),
    "simple", objectCacheKey(project.simpleEncounters),
    "complex", objectCacheKey(project.complexEncounters),
    "extracodes", objectCacheKey(project.extracodes),
    "randomLevels", objectCacheKey(project.randomLevels),
    "ed3Reachability", objectCacheKey(project.semanticSchema?.decoding?.ed3Reachability)
  ].join(":");
}

function resourceUsageDependencyKey(project: Project) {
  return ["maps", objectCacheKey(project.maps)].join(":");
}

function objectCacheKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIds.get(value);
  if (existing) return String(existing);
  const next = nextObjectId++;
  objectIds.set(value, next);
  return String(next);
}

function writeLimitedCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  if (cache.size <= MAX_CONTENT_USAGE_CACHE_ENTRIES) return;
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

function buildMapCicnUsageLinks(project: Project) {
  const links = new Map<number, ContentUsageLink[]>();
  for (const map of project.maps ?? []) {
    const counts = new Map<number, number>();
    for (const tile of map.tiles ?? []) {
      for (const resourceId of candidateCicnResourceIds(tile)) {
        counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
      }
    }
    for (const [resourceId, count] of counts) {
      const existing = links.get(resourceId) ?? [];
      existing.push({
        key: `icon-map:${map.id}`,
        label: map.name,
        detail: `${count.toLocaleString()} tile${count === 1 ? "" : "s"} on map`,
        entity: { type: "map", id: `map:${map.levelType}:${map.index}` }
      });
      links.set(resourceId, existing);
    }
  }
  return links;
}

function candidateCicnResourceIds(tile: number) {
  const ids = new Set<number>([tile, -tile]);
  if (tile < 0) ids.add(-2000 - tile);
  return ids;
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
    if (normalizeStepOpcode(action.rawCode) !== 9 || Math.abs(action.id) !== Math.abs(resourceId)) return;
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
      if (Math.abs(target.value) !== Math.abs(resourceId)) continue;
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
        label: triggerLabel(project, trigger),
        actionLabel: `Action slot ${action.slot}`,
        entity: triggerUsageEntity(trigger)
      });
    }
  }
  for (const encounter of project.simpleEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      visit(action, {
        key: `simple:${encounter.id}:action:${action.slot}`,
        label: `Simple Encounter ${encounter.id}`,
        actionLabel: `Action step ${action.slot}`,
        entity: { type: "encounter", id: `encounter:simple:${encounter.id}` }
      });
    }
  }
  for (const encounter of project.complexEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      visit(action, {
        key: `complex:${encounter.id}:action:${action.slot}`,
        label: `Complex Encounter ${encounter.id}`,
        actionLabel: `Action step ${action.slot}`,
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

function triggerLabel(project: Project, trigger: Project["triggers"][number]) {
  if (trigger.levelType != null && trigger.levelIndex != null && trigger.coordinate) {
    return `${trigger.levelType} ${trigger.levelIndex} Action Point ${trigger.recordIndex}`;
  }
  if (trigger.source === "Data ED3") return `${authorFacingExtraActionKind(extraActionClassification(project, trigger))} ${trigger.recordIndex}`;
  return `Action Point ${trigger.recordIndex}`;
}

function triggerUsageEntity(trigger: Project["triggers"][number]): SelectedEntity {
  if (trigger.source === "Data ED3") return { type: "macro", id: `macro:${trigger.recordIndex}` };
  return { type: "trigger", id: trigger.id };
}

function extraActionClassification(project: Project, trigger: Project["triggers"][number]) {
  const row = project.semanticSchema?.decoding?.ed3Reachability?.find((candidate) => candidate.recordIndex === trigger.recordIndex);
  if (!row?.reachable) return importedExtraActionLabel(row?.classification);
  const rootType = String(row.rootType ?? "");
  if (rootType.includes("global")) return "Global Macro";
  if (rootType.includes("random")) return "Random Encounter Action";
  if (rootType.includes("time")) return "Timed Encounter Action";
  if (rootType.includes("battle") || rootType.includes("monster") || rootType.includes("item")) return "Battle / Monster / Item Action";
  return "Callable Extra Action Point";
}

function importedExtraActionLabel(classification: string | null | undefined) {
  if (classification === "probable-editor-padding") return "Likely Padding";
  if (classification === "runtime-mutation-candidate") return "Runtime Residue";
  return "Unlinked Extra Action";
}

function authorFacingExtraActionKind(classification: string) {
  if (classification === "Callable Extra Action Point") return "Extra Action Point";
  if (classification === "Global Macro") return "Global Event";
  if (classification === "Random Encounter Action") return "Random Encounter Action";
  if (classification === "Timed Encounter Action") return "Timed Encounter Action";
  if (classification === "Battle / Monster / Item Action") return "Source-Linked Extra Action";
  if (classification === "Likely Padding" || classification === "Imported Empty Slot") return "Likely Padding";
  if (classification === "Runtime Residue" || classification === "Imported Runtime Mutation") return "Runtime Residue";
  return "Unlinked Extra Action";
}
