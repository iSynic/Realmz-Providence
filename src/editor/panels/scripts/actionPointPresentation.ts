import type { EdcdRowUsage } from "../../edcdRows";
import { normalizeStepOpcode } from "../../realmzActions";
import type { Ed3ReachabilityRow, Project, SelectedEntity, TriggerRecord } from "../../types";
import { selectEntityFromId } from "../../utils";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export type CombatMacroContextKind = "battle" | "monster" | "mixed";

export type CombatMacroReference = {
  kind: "battle" | "monster";
  key: string;
  label: string;
  detail: string;
  entity?: SelectedEntity;
  runnable?: boolean;
};

export type CombatMacroContext = {
  kind: CombatMacroContextKind;
  references: CombatMacroReference[];
  rootType: string | null;
};

export function authorFacingExtraActionKind(classification: string, combatMacroContext?: CombatMacroContext | null) {
  if (combatMacroContext?.kind === "battle") return "Battle Macro";
  if (combatMacroContext?.kind === "monster") return "Monster Macro";
  if (combatMacroContext?.kind === "mixed") return "Combat Macro";
  if (classification === "Callable Extra Action Point") return "Extra Action Point";
  if (classification === "Global Macro") return "Global Macro";
  if (classification === "Random Encounter Action") return "Random Encounter Action";
  if (classification === "Timed Encounter Action") return "Timed Encounter Action";
  if (classification === "Battle / Monster / Item Action") return "Source-Linked Extra Action";
  if (classification === "Likely Padding" || classification === "Imported Empty Slot") return "Likely Padding";
  if (classification === "Runtime Residue" || classification === "Imported Runtime Mutation") return "Runtime Residue";
  return "Unlinked Extra Action";
}

export function textEditorNavigationLabel(editor: string) {
  if (editor === "messages") return "Strings";
  if (editor === "option-labels") return "Option Labels";
  if (editor === "scrolling-text") return "Scrolling Text";
  return "Text";
}

export function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}

export function combatMacroContextFor(
  project: Project,
  trigger: TriggerRecord,
  reachability: Ed3ReachabilityRow | null
): CombatMacroContext | null {
  if (trigger.source !== "Data ED3") return null;
  const macroId = trigger.recordIndex;
  const references: CombatMacroReference[] = [];
  for (const battle of project.battles ?? []) {
    if (!battle.battleMacro || Math.abs(battle.battleMacro) !== macroId) continue;
    const placed = battle.grid.filter((cell) => cell !== 0).length;
    references.push({
      kind: "battle",
      key: `battle:${battle.id}`,
      label: `Battle ${battle.id}`,
      detail: `${battle.battleMacro < 0 ? "Runnable negative battle macro" : "Imported positive value, preserved but not the normal runnable path"}; ${placed} placed monster slot(s).`,
      entity: selectEntityFromId(`battle:${battle.id}`),
      runnable: battle.battleMacro < 0
    });
  }
  const addMonsterRefs = (records: Project["monsters"], setLabel: string, setFile: string) => {
    for (const monster of records ?? []) {
      if (!monster.deathMacro || Math.abs(monster.deathMacro) !== macroId) continue;
      references.push({
        kind: "monster",
        key: `monster:${setFile}:${monster.id}`,
        label: `${setLabel} Monster ${monster.id}`,
        detail: `${monster.displayName || `Monster ${monster.id}`} defeat macro from ${setFile}.`,
        entity: selectEntityFromId(`monster:${monster.id}`),
        runnable: true
      });
    }
  };
  addMonsterRefs(project.monsters ?? [], "Normal", "Data MD");
  for (const set of project.monsterSets ?? []) {
    const setLabel = set.setId === 1 ? "Monster" : set.setId === -1 ? "Mega" : "Normal";
    addMonsterRefs(set.monsters, setLabel, set.sourceFile || (set.setId === 1 ? "Data MD1" : set.setId === -1 ? "Data MD-1" : "Data MD"));
  }
  const uniqueReferences = Array.from(new Map(references.map((reference) => [reference.key, reference])).values());
  const hasBattle = uniqueReferences.some((reference) => reference.kind === "battle");
  const hasMonster = uniqueReferences.some((reference) => reference.kind === "monster");
  const rootType = reachability?.rootType ?? null;
  if (!hasBattle && !hasMonster && !rootType?.includes("battle") && !rootType?.includes("monster")) return null;
  return {
    kind: hasBattle && hasMonster ? "mixed" : hasBattle || rootType?.includes("battle") ? "battle" : "monster",
    references: uniqueReferences,
    rootType
  };
}

export function combatMacroContextTitle(context: CombatMacroContext) {
  if (context.kind === "battle") return "Battle Macro";
  if (context.kind === "monster") return "Monster Macro";
  return "Combat Macro";
}

export function combatMacroContextBody(context: CombatMacroContext) {
  if (context.kind === "battle") {
    return "Realmz checks an assigned battle macro after each combat round. Code 126 is the battle criteria gate and is often the first step; if its criteria pass, the remaining steps execute in battle context.";
  }
  if (context.kind === "monster") {
    return "Realmz runs an assigned monster macro when that monster dies. Monster macro actions can target the dead monster position, the killer, or related active combat monsters depending on the opcode.";
  }
  return "This Extra Action Point is referenced from both battle and monster combat paths. Keep battle-round criteria and monster-death effects explicit when mixing those flows.";
}

export function combatMacroContextLabel(context: CombatMacroContext) {
  const battleCount = context.references.filter((reference) => reference.kind === "battle").length;
  const monsterCount = context.references.filter((reference) => reference.kind === "monster").length;
  if (battleCount && monsterCount) return `${battleCount} battle / ${monsterCount} monster reference(s)`;
  if (battleCount) return `${battleCount} battle reference(s)`;
  if (monsterCount) return `${monsterCount} monster reference(s)`;
  return context.rootType ? `Reachability: ${context.rootType}` : "Combat reachability";
}

export function combatMacroActionOpcodes(context: CombatMacroContext | null) {
  if (!context) return [];
  if (context.kind === "battle") return [126, 127, 121, 123, 124, 125, 120];
  if (context.kind === "monster") return [119, 122, 127, 121, 123, 124, 125, 120, 17];
  return [126, 119, 122, 127, 121, 123, 124, 125, 120, 17];
}

export function combatMacroActionNote(opcode: number, context: CombatMacroContext | null) {
  if (!context) return null;
  const code = normalizeStepOpcode(opcode);
  if (code === 126) return "Battle macro criteria: Realmz checks this after each combat round before continuing the rest of the macro.";
  if (code === 119) return "Monster macro revive: an NPC killed in combat returns after combat with 1 stamina.";
  if (code === 122) return "Monster macro fumble: affects the creature that killed this monster.";
  if (code === 17 && context.kind !== "battle") return "In a monster death macro, Realmz uses the destroyed monster's position for the spell target.";
  if (code === 121) return "Combat macro action: de-animates lower unintelligent undead in monster or battle macro context.";
  if (code === 123) return "Combat macro action: routes matching active monsters away from the fight.";
  if (code === 124) return "Combat macro action: spawns replacement monsters from the macro's combat context.";
  if (code === 125) return "Combat macro action: destroys related active monsters.";
  if (code === 127) return "Combat macro condition: continue only while the selected monster is still present.";
  if (code === 120) return "Combat mutation: changes an active monster or NPC icon/traitor value during combat.";
  return null;
}

export function humanActionValueLabel(label: string) {
  const clean = label.replace(/\bID\b/g, "Value").replace(/\bNumber\b/g, "Value").replace(/\s+/g, " ").trim();
  return clean && clean !== "Value" ? clean : "Value";
}

export function actionAuthoringStateLabel(definition: ScriptActionDefinition, combatMacroContext?: CombatMacroContext | null) {
  if (definition.opcode === 121 && combatMacroContext) return "Combat macro action";
  if (definition.opcode === 121) return "Macro-only imported action";
  if ([84, 98, 99].includes(definition.opcode)) return "Legacy registration action";
  if (definition.shortLabel === "Inert Imported Action") return "Inert imported action";
  if (definition.validationPosture === "no-effect") return "Preserve-only / no normal effect";
  if (definition.authoringLevel === "first-class") return "Friendly editor";
  if (definition.authoringLevel === "guided") return "Guided settings editor";
  if (definition.authoringLevel === "advanced") return "Unmodeled action";
  return "Empty step";
}

export function actionAuthoringStateDetail(definition: ScriptActionDefinition, combatMacroContext?: CombatMacroContext | null) {
  if (definition.opcode === 121) {
    if (combatMacroContext) return "This action is meaningful in the selected battle or monster macro. Providence edits the same CODE/ID and Action Settings while keeping Extra Action Point storage unchanged.";
    return "Realmz source performs this only during combat. Ordinary AP imports are preserved here and are not routine Action Point authoring backlog; use monster or battle macro surfaces for intentional authoring.";
  }
  if ([84, 98, 99].includes(definition.opcode)) {
    return "Divinity documents these registration actions without an authored ID or E-Code value. Placing the step runs the legacy registration behavior; modern open-source Realmz keeps related dispatchers but comments out enforcement.";
  }
  if (definition.shortLabel === "Inert Imported Action") {
    return "This is a documented Not Used opcode. Providence keeps the imported CODE/ID value, but it is not normal authoring behavior.";
  }
  if (definition.validationPosture === "no-effect") {
    return "Realmz does not expose normal runtime behavior for this dispatcher row. Providence preserves the stored CODE/ID values, but routine authoring is disabled.";
  }
  if (definition.authoringLevel === "first-class") {
    return "Providence knows the target type and can edit this as normal scenario behavior.";
  }
  if (definition.authoringLevel === "guided") {
    return "Providence edits the attached Action Settings with named fields, while keeping the original storage row and file format intact.";
  }
  if (definition.authoringLevel === "advanced") {
    return "Providence recognizes and preserves the stored values, but this action does not yet have a complete friendly authoring form.";
  }
  return "Realmz skips empty slots.";
}

export function actionStorageLabel(definition: ScriptActionDefinition) {
  if (definition.storage === "direct-code-id") return "Direct CODE / ID";
  if (definition.storage === "data-edcd-parameter-row") return "Action Settings";
  if (definition.storage === "data-ed3-direct") return "Extra Action Point";
  if (definition.storage === "same-map-action-point-copy") return "Same-map Action Point copy";
  return definition.storage;
}

export function actionSettingsTitleForShape(edcdShape?: string | null, fallback = "Action Settings") {
  const normalized = edcdShape?.toLowerCase();
  const titles: Record<string, string> = {
    "action-data-patching": "Action Code Replacement",
    battle: "Battle Setup",
    choice: "Choice Dialog",
    "random-message": "Message Range",
    teleport: "Movement",
    "party-condition-branch": "Condition Branch",
    "force-branch": "Branch Target",
    "percent-branch": "Percent Branch",
    "condition-branch": "Condition Branch",
    "random-region-shape-mutation": "Random Area Shape",
    fumble: "Fumble Result"
  };
  return normalized ? titles[normalized] ?? fallback : fallback;
}

export function actionSettingsTitleForStep(definition: ScriptActionDefinition, edcdShape?: string) {
  return actionSettingsTitleForShape(edcdShape, definition.target?.label ?? "Action Settings");
}

export function actionSettingsFieldLabel(title: string) {
  return title.endsWith("Settings") ? title : `${title} Settings`;
}

export function authorSettingsWarning(usage: EdcdRowUsage, title: string, warning: string) {
  const label = actionSettingsFieldLabel(title).toLowerCase();
  if (usage.status === "missing") return `This step references ${label} that do not exist yet. Applying the fields below will create them.`;
  if (usage.status === "shared") return `These ${label} are shared by ${usage.callers.length} steps. Editing them changes every caller.`;
  if (usage.status === "conflict") return `These settings are used by different action types: ${usage.possibleShapes.join(", ")}. Duplicate before editing if that is not intentional.`;
  if (usage.status === "unused") return `These ${label} are stored but not called by another script yet.`;
  return warning.replace(/\bSettings\s*#?\d+\b/gi, "these settings");
}
