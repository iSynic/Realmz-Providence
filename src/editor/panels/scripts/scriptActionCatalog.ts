import { ACTION_OPTIONS, NOT_USED_ACTION_CODES, actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode, type RealmzActionOption } from "../../realmzActions";
import { crosswalkForOpcode, parameterLabelsForOpcode } from "../../opcodeCrosswalk";
import { signedTargetBehaviorLabel, targetOptionForOpcodeValue, targetPickerConfig } from "../../components/RealmzTargetPicker";
import { choiceBranchModeLabel, choiceBranchTargetKind, parseChoicePromptValue } from "../../choiceDialogs";
import { edcdFieldTargetKind, edcdTargetOptions, type EdcdTargetKind } from "../../edcdTargets";
import { LibraryCatalog, Project } from "../../types";

export type ScriptActionCategory =
  | "Dialogue"
  | "Choices"
  | "Encounters"
  | "Rewards"
  | "Travel"
  | "Media"
  | "Party"
  | "Items"
  | "Rules"
  | "Logic"
  | "Extra Action Points"
  | "Advanced";

export type ScriptActionStorage =
  | "direct-code-id"
  | "data-edcd-parameter-row"
  | "data-ed3-direct"
  | "same-map-action-point-copy";

export type ScriptActionAuthoringLevel = "first-class" | "guided" | "advanced" | "ignored";

export type ScriptActionValidationPosture =
  | "validated-targets"
  | "validated-settings"
  | "advanced-import"
  | "no-effect";

export type ScriptStepFormKind =
  | "message"
  | "choice"
  | "movement"
  | "battle"
  | "encounter"
  | "reward"
  | "party"
  | "rules"
  | "logic"
  | "media"
  | "reusable-action"
  | "guided-settings"
  | "advanced";

export type ScriptTargetFieldDefinition = {
  label: string;
  help: string;
  realmzField: "ID";
  targetFamily: string;
  defaultValue: number;
  createLabel?: string;
  allowsNegative?: boolean;
};

export type ScriptParameterFieldDefinition = {
  index: number;
  label: string;
  help: string;
  internalName: string;
  targetFamily?: string | null;
  defaultValue: number;
  preserved: boolean;
};

export type ScriptStepDraft = {
  rawCode: number;
  id: number;
  parameters?: readonly [number, number, number, number, number];
};

export type ScriptReadinessIssue = {
  severity: "error" | "warning" | "info";
  message: string;
};

export type ScriptActionCoverageEntry = {
  opcode: number;
  label: string;
  category: ScriptActionCategory;
  authoringLevel: ScriptActionAuthoringLevel;
  formKind: ScriptStepFormKind;
  targetMeaning: string;
  validationPosture: ScriptActionValidationPosture;
};

export type ScriptStepFormDefinition = {
  opcode: number;
  kind: ScriptStepFormKind;
  title: string;
  authoringLevel: ScriptActionAuthoringLevel;
  targetLabel: string;
  parameterLabels: string[];
};

export type ScriptTargetRoute = {
  label: string;
  targetKind: string;
  value: number;
  detail: string;
};

export type ScriptFlowPreviewRoute = {
  kind: "continues" | "stops" | "branch" | "call" | "target" | "outcome";
  label: string;
  detail: string;
  target?: ScriptTargetRoute;
};

export type ScriptActionDefinition = {
  opcode: number;
  label: string;
  shortLabel: string;
  category: ScriptActionCategory;
  categoryLabel: string;
  summary: string;
  description: string;
  realmzOptionLabel: string;
  storage: ScriptActionStorage;
  edcdShape?: string;
  searchTerms: string[];
  target?: ScriptTargetFieldDefinition;
  parameters: ScriptParameterFieldDefinition[];
  defaultDraft: ScriptStepDraft;
  advanced: boolean;
  authoringLevel: ScriptActionAuthoringLevel;
  validationPosture: ScriptActionValidationPosture;
  formKind: ScriptStepFormKind;
};

const CATEGORY_ORDER: ScriptActionCategory[] = [
  "Dialogue",
  "Choices",
  "Encounters",
  "Rewards",
  "Travel",
  "Media",
  "Party",
  "Items",
  "Rules",
  "Logic",
  "Extra Action Points",
  "Advanced"
];

const FIRST_CLASS_ACTIONS = new Set([
  1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 81, 82, 83, 85, 86,
  87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107,
  108, 111, 112, 119, 120, 122, 123, 124, 125, 126, 127, -14, -23
]);

const ADVANCED_ACTIONS = new Set([84, 121]);

const IGNORED_ACTIONS = new Set([0, ...NOT_USED_ACTION_CODES]);

const ACTION_OVERRIDES: Record<number, Partial<Pick<ScriptActionDefinition, "label" | "shortLabel" | "category" | "description" | "searchTerms">>> = {
  [-23]: { label: "Change Random Encounter Area", shortLabel: "Random Area", category: "Encounters", description: "Adjust a dungeon random encounter area." },
  [-14]: { label: "Pick Opposite Characters", shortLabel: "Pick Opposite", category: "Party", description: "Switch the selected character set to its opposite." },
  0: { label: "Empty Step", shortLabel: "Empty", category: "Advanced", description: "Leave this step unused." },
  1: { label: "Show Message", shortLabel: "Show Message", category: "Dialogue", description: "Show a scenario message." },
  2: { label: "Start Battle", shortLabel: "Battle", category: "Encounters", description: "Start a battle or battle range." },
  3: { label: "Ask Choice", shortLabel: "Choice", category: "Choices", description: "Ask the player a two-option question and route the result." },
  4: { label: "Start Simple Encounter", shortLabel: "Simple Encounter", category: "Encounters", description: "Run a simple encounter." },
  5: { label: "Start Complex Encounter", shortLabel: "Complex Encounter", category: "Encounters", description: "Run a complex encounter." },
  6: { label: "Open Shop", shortLabel: "Shop", category: "Rewards", description: "Open a shop." },
  7: { label: "Change Action Point Codes", shortLabel: "Patch Actions", category: "Logic", description: "Replace another Action Point or encounter result script with codes stored in an Extra Action Point." },
  8: { label: "Run Same-Map Action Point", shortLabel: "Same-Map Action", category: "Extra Action Points", description: "Run another Action Point from the current map." },
  9: { label: "Play Sound", shortLabel: "Sound", category: "Media", description: "Play a sound effect." },
  10: { label: "Give Treasure", shortLabel: "Treasure", category: "Rewards", description: "Give a treasure reward." },
  11: { label: "Give Victory Points", shortLabel: "Victory Points", category: "Rewards", description: "Give victory points to the party." },
  12: { label: "Change Map Tile", shortLabel: "Tile Change", category: "Travel", description: "Change a land or dungeon tile." },
  13: { label: "Change Action Point State", shortLabel: "Action State", category: "Logic", description: "Enable, disable, or change an Action Point." },
  14: { label: "Pick Characters", shortLabel: "Pick Characters", category: "Party", description: "Ask the player to pick party members for following steps." },
  15: { label: "Damage Party", shortLabel: "Damage", category: "Party", description: "Damage selected characters or the party." },
  16: { label: "Heal Party", shortLabel: "Heal", category: "Party", description: "Heal selected characters or the party." },
  17: { label: "Cast Spell", shortLabel: "Cast Spell", category: "Rules", description: "Cast a spell from this action." },
  18: { label: "Force Spell", shortLabel: "Force Spell", category: "Rules", description: "Force a spell effect." },
  19: { label: "Show Random Message", shortLabel: "Random Message", category: "Dialogue", description: "Show a random message from a range." },
  20: { label: "Move Party", shortLabel: "Move Party", category: "Travel", description: "Move the party to another level and cell." },
  21: { label: "Branch On Item", shortLabel: "Item Branch", category: "Items", description: "Branch depending on whether the party has an item." },
  22: { label: "Change Item", shortLabel: "Item Change", category: "Items", description: "Drop, charge, or replace item data." },
  23: { label: "Change Random Encounter Area", shortLabel: "Random Area", category: "Encounters", description: "Adjust a random encounter area." },
  24: { label: "Continue Steps", shortLabel: "Continue", category: "Logic", description: "Keep evaluating following steps." },
  25: { label: "Exit And Delete Action Point", shortLabel: "Exit/Delete AP", category: "Logic", description: "Stop this script and delete or disable the current Action Point after it fires." },
  26: { label: "Get Click", shortLabel: "Get Click", category: "Logic", description: "Wait for or capture a player click for following action behavior." },
  27: { label: "Show Picture", shortLabel: "Picture", category: "Media", description: "Show a picture resource." },
  28: { label: "Redraw Screen", shortLabel: "Redraw", category: "Media", description: "Force Realmz to redraw the game screen." },
  29: { label: "Show Map Reference", shortLabel: "Map Reference", category: "Travel", description: "Use or reveal map-related data." },
  30: { label: "Pick Characters By Check", shortLabel: "Pick By Check", category: "Party", description: "Pick characters by ability or attribute check." },
  31: { label: "Branch On Check", shortLabel: "Check Branch", category: "Logic", description: "Branch based on an ability or attribute check." },
  32: { label: "Offer Temple", shortLabel: "Temple", category: "Rewards", description: "Offer temple services using the ID value as the temple inflation rate." },
  33: { label: "Change Gold", shortLabel: "Gold", category: "Rewards", description: "Take, give, or check party gold." },
  34: { label: "Break Encounter Loop", shortLabel: "Break Loop", category: "Encounters", description: "Break out of an encounter loop; only meaningful inside encounter scripts." },
  35: { label: "Change Encounter State", shortLabel: "Encounter State", category: "Encounters", description: "Change a simple encounter's state." },
  36: { label: "Capture Or Restore Equipment", shortLabel: "Equipment State", category: "Items", description: "Capture or restore the party's equipment state." },
  37: { label: "Move In Dungeon", shortLabel: "Dungeon Move", category: "Travel", description: "Move the party within a dungeon." },
  38: { label: "Force Branch", shortLabel: "Force Branch", category: "Logic", description: "Route execution to another result or action." },
  39: { label: "Run Extra Action Point", shortLabel: "Extra AP", category: "Extra Action Points", description: "Run an Extra Action Point." },
  40: { label: "Branch On Condition", shortLabel: "Condition Branch", category: "Logic", description: "Branch based on party condition state." },
  41: { label: "Change Encounter Choice", shortLabel: "Encounter Choice", category: "Encounters", description: "Clear or change a simple encounter choice." },
  42: { label: "Branch By Percent", shortLabel: "Percent Branch", category: "Logic", description: "Branch based on a percent roll." },
  43: { label: "Change Condition", shortLabel: "Condition", category: "Party", description: "Give or alter a party or character condition." },
  44: { label: "Eliminate Complex Encounter Choice", shortLabel: "Eliminate Choice", category: "Encounters", description: "Eliminate a branch from a complex encounter choice." },
  45: { label: "Move Party Without Trigger", shortLabel: "Move Only", category: "Travel", description: "Move the party without firing the arrival trigger." },
  46: { label: "Force Branch", shortLabel: "Force Branch", category: "Logic", description: "Route execution to another result or action." },
  47: { label: "Set Quest Flag", shortLabel: "Quest Flag", category: "Logic", description: "Set a quest flag value." },
  48: { label: "Start Selective Battle", shortLabel: "Selective Battle", category: "Encounters", description: "Start a battle with optional message, sound, and treasure." },
  49: { label: "Open Shop", shortLabel: "Shop", category: "Rewards", description: "Open or route to a shop." },
  50: { label: "Pick Race Or Caste", shortLabel: "Race/Caste Pick", category: "Party", description: "Pick characters by race, caste, class, or gender." },
  51: { label: "Change Shop", shortLabel: "Shop Change", category: "Rewards", description: "Change shop inflation or stock." },
  52: { label: "Pick Characters", shortLabel: "Character Pick", category: "Party", description: "Pick characters by movement, position, item, saves, or similar state." },
  53: { label: "Pick Caste", shortLabel: "Caste Pick", category: "Party", description: "Pick characters by caste." },
  54: { label: "Change Timed Encounter", shortLabel: "Timed Encounter", category: "Encounters", description: "Change a timed encounter schedule or state." },
  55: { label: "Branch On Picked Party", shortLabel: "Picked Branch", category: "Logic", description: "Branch based on whether characters are currently picked." },
  56: { label: "Start Battle With Outcome", shortLabel: "Battle Outcome", category: "Encounters", description: "Start a battle and route if the party flees." },
  57: { label: "Change Land Look", shortLabel: "Land Look", category: "Travel", description: "Change the map's landlook or render state." },
  58: { label: "Force Branch", shortLabel: "Force Branch", category: "Logic", description: "Route execution to another result or action." },
  59: { label: "Force Branch", shortLabel: "Force Branch", category: "Logic", description: "Route execution to another result or action." },
  60: { label: "Change Money State", shortLabel: "Money State", category: "Rewards", description: "Change party money state." },
  61: { label: "Shift Position", shortLabel: "Position Shift", category: "Travel", description: "Shift the current party position." },
  62: { label: "Show Scrolling Text", shortLabel: "Scrolling Text", category: "Dialogue", description: "Show a scrolling text scene." },
  63: { label: "Change Time", shortLabel: "Time", category: "Logic", description: "Set or offset game time." },
  64: { label: "Branch On Time", shortLabel: "Time Branch", category: "Logic", description: "Branch based on the current game day and hour." },
  65: { label: "Give Random Items", shortLabel: "Random Items", category: "Items", description: "Give a random item from a range." },
  66: { label: "Set Camping Ability", shortLabel: "Camping", category: "Travel", description: "Control whether the party can camp." },
  67: { label: "Branch On Item Charges", shortLabel: "Charge Branch", category: "Items", description: "Branch based on item charges." },
  68: { label: "Change Fatigue", shortLabel: "Fatigue", category: "Party", description: "Alter party or character fatigue." },
  69: { label: "Set Spell Flags", shortLabel: "Spell Flags", category: "Rules", description: "Set combat spellcasting flags." },
  70: { label: "Save Or Restore Position", shortLabel: "Save Position", category: "Travel", description: "Save or restore party position." },
  71: { label: "Toggle Coordinate Display", shortLabel: "Coordinate Display", category: "Travel", description: "Show or hide the coordinate display." },
  72: { label: "Branch On Range", shortLabel: "Range Branch", category: "Logic", description: "Branch to a target based on a range or test." },
  73: { label: "Open Restricted Shop", shortLabel: "Restricted Shop", category: "Rewards", description: "Open a restricted shop." },
  74: { label: "Change Spell Points", shortLabel: "Spell Points", category: "Rules", description: "Alter spell points." },
  75: { label: "Branch On Range", shortLabel: "Range Branch", category: "Logic", description: "Branch to a target based on a range or test." },
  76: { label: "Set Quest Value", shortLabel: "Quest Value", category: "Logic", description: "Write a quest value." },
  77: { label: "Branch On Quest", shortLabel: "Quest Branch", category: "Logic", description: "Branch on a quest value." },
  78: { label: "Branch True Or False", shortLabel: "True/False", category: "Logic", description: "Branch to one result for false and another for true." },
  81: { label: "Branch On Condition", shortLabel: "Condition Branch", category: "Logic", description: "Branch to Extra Action Points based on condition state." },
  82: { label: "Turn Cleric Turning Off", shortLabel: "Turning Off", category: "Rules", description: "Disable cleric turning behavior." },
  83: { label: "Turn Cleric Turning On", shortLabel: "Turning On", category: "Rules", description: "Enable cleric turning behavior." },
  84: {
    label: "Registration Check Discrepancy",
    shortLabel: "Registration Check?",
    category: "Advanced",
    description: "Manual/Divinity material labels this not used, but Realmz Revisited contains a registration-check dispatcher case. Providence preserves existing values until classic behavior is verified.",
    searchTerms: ["not used", "registration", "discrepancy", "preserve"]
  },
  85: { label: "Branch Randomly", shortLabel: "Random Branch", category: "Logic", description: "Branch to a random target in a range." },
  86: { label: "Branch On Party State", shortLabel: "Party Branch", category: "Logic", description: "Branch based on party, race, caste, gender, boat, camp, or level tests." },
  87: { label: "Conditional Branch", shortLabel: "Conditional", category: "Logic", description: "Branch based on conditional tests." },
  88: { label: "Drop Special Character", shortLabel: "Drop Special", category: "Party", description: "Remove a special character from the party." },
  89: { label: "Add Special Character", shortLabel: "Add Special", category: "Party", description: "Add a special character to the party." },
  90: { label: "Change Party State", shortLabel: "Party State", category: "Party", description: "Alter victory or experience-style party state." },
  91: { label: "Drop All Equipment", shortLabel: "Drop Equipment", category: "Items", description: "Drop all party equipment." },
  92: { label: "Change Random Area Shape", shortLabel: "Area Shape", category: "Encounters", description: "Change a random encounter area's percent and shape." },
  93: { label: "Turn Compass On", shortLabel: "Compass On", category: "Travel", description: "Enable the compass display." },
  94: { label: "Turn Compass Off", shortLabel: "Compass Off", category: "Travel", description: "Disable the compass display." },
  95: { label: "Change Look Direction", shortLabel: "Look Direction", category: "Travel", description: "Force the party to face a direction." },
  96: { label: "Force 3D Dungeon View", shortLabel: "3D View", category: "Travel", description: "Force the party to use the 3D view while in dungeons." },
  97: { label: "Use Map Record", shortLabel: "Map Record", category: "Travel", description: "Use or reference a map record." },
  98: { label: "Require Registration", shortLabel: "Require Reg", category: "Logic", description: "Run a legacy registration requirement check." },
  99: { label: "Get Scenario Registration", shortLabel: "Get Registration", category: "Logic", description: "Run the legacy scenario registration gate." },
  100: { label: "End Battle", shortLabel: "End Battle", category: "Encounters", description: "End the current battle." },
  101: { label: "Back Up Party", shortLabel: "Back Up", category: "Travel", description: "Move the party back one square opposite the direction they entered from. Classic Divinity notes this only works on land levels." },
  102: { label: "Level Up Picked Characters", shortLabel: "Level Up", category: "Party", description: "Level up the currently picked characters." },
  103: { label: "Change Boat Or Camp", shortLabel: "Boat/Camp", category: "Travel", description: "Change boat or camp state." },
  104: { label: "Set Encounter Status", shortLabel: "Encounter Status", category: "Encounters", description: "Set encounter status." },
  105: { label: "Suspend Or Activate Allies", shortLabel: "Allies", category: "Party", description: "Suspend or activate allies." },
  106: { label: "Change Darkness", shortLabel: "Darkness", category: "Travel", description: "Set outdoor darkness state." },
  107: { label: "Start Selective Battle", shortLabel: "Selective Battle", category: "Encounters", description: "Start an improved selective battle and route if the party flees." },
  108: { label: "Change Selected Character", shortLabel: "Selected Character", category: "Party", description: "Alter selected-character combat or stat fields." },
  111: { label: "Return From Extra Action Point", shortLabel: "Return", category: "Extra Action Points", description: "Return from an Extra Action Point." },
  112: { label: "Pop Script Stack", shortLabel: "Pop", category: "Extra Action Points", description: "Pop script stack state." },
  119: { label: "Revive NPC After Combat", shortLabel: "Revive NPC", category: "Encounters", description: "Revive an NPC after combat." },
  120: { label: "Change Combat Monster", shortLabel: "Combat Monster", category: "Encounters", description: "Alter combat monster id, count, or icon state." },
  121: {
    label: "De-animate Lower Undead",
    shortLabel: "De-animate Undead",
    category: "Encounters",
    description: "Combat macro action. Outside monster or battle macro contexts, Providence preserves imported rows instead of presenting this as routine AP authoring.",
    searchTerms: ["destroy undead", "lower undead", "deanimate", "de-animate", "macro only", "combat macro"]
  },
  122: { label: "Show Fumble Result", shortLabel: "Fumble", category: "Encounters", description: "Show combat fumble message or sound behavior." },
  123: { label: "Rout Monsters", shortLabel: "Rout", category: "Encounters", description: "Cause matching active combat monsters to rout." },
  124: { label: "Spawn Monsters", shortLabel: "Spawn", category: "Encounters", description: "Spawn combat monsters." },
  125: { label: "Destroy Related Monsters", shortLabel: "Destroy Related", category: "Encounters", description: "Destroy related combat monsters." },
  126: { label: "Run Battle Action", shortLabel: "Battle Action", category: "Encounters", description: "Run battle action behavior." },
  127: { label: "Continue If Monster Present", shortLabel: "Monster Present", category: "Encounters", description: "Continue monster or battle macro behavior if a matching monster is present." }
};

type ScriptActionMetadataOverride = {
  storage?: ScriptActionStorage;
  edcdShape?: string;
  target?: Partial<ScriptTargetFieldDefinition>;
  defaultDraft?: ScriptStepDraft;
  parameterDefaults?: readonly [number, number, number, number, number];
  parameters?: Record<number, Partial<ScriptParameterFieldDefinition>>;
};

const ACTION_METADATA_OVERRIDES: Record<number, ScriptActionMetadataOverride> = {
  1: {
    storage: "direct-code-id",
    target: {
      label: "Message",
      targetFamily: "message",
      defaultValue: 0,
      allowsNegative: true,
      help: "Message record to display from the scenario text table. Negative IDs display without waiting for an extra click."
    },
    defaultDraft: { rawCode: 1, id: 0 }
  },
  2: {
    storage: "data-edcd-parameter-row",
    edcdShape: "battle",
    target: parameterRowTarget("Battle Settings"),
    defaultDraft: { rawCode: 2, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      2: { label: "Sound / Revive Action", help: "Optional pre-battle sound. When Reward / Revive Mode is 10, this runs the Extra Action Point after a revived loss." },
      3: { label: "Before Message" },
      4: { label: "Reward / Revive Mode", help: "0 awards victory and treasure, 5 awards victory only, 10 revives the party after a loss and skips rewards." }
    }
  },
  3: {
    storage: "data-edcd-parameter-row",
    edcdShape: "choice",
    target: parameterRowTarget("Choice Settings"),
    defaultDraft: { rawCode: 3, id: 0, parameters: [1, 0, 0, 0, 0] },
    parameterDefaults: [1, 0, 0, 0, 0],
    parameters: {
      0: { label: "Continue When", help: "1 continues on the left/yes choice; 0 continues on the right/no choice." },
      1: { label: "Otherwise", help: "Behavior for the non-continuing answer: back up, branch to an Extra Action Point or encounter, or eliminate." },
      2: { label: "Branch Target" },
      3: { label: "Left Option" },
      4: { label: "Right Option" }
    }
  },
  8: {
    storage: "same-map-action-point-copy",
    target: {
      label: "Source Action Point",
      realmzField: "ID",
      targetFamily: "same-map-action-point",
      defaultValue: 0,
      help: "Action Point on the same map to run from here."
    },
    defaultDraft: { rawCode: 8, id: 0 }
  },
  11: {
    storage: "direct-code-id",
    target: {
      label: "Victory Points",
      realmzField: "ID",
      targetFamily: "victory-points",
      defaultValue: 1,
      help: "Amount of victory points to award."
    },
    defaultDraft: { rawCode: 11, id: 1 }
  },
  14: {
    storage: "direct-code-id",
    target: {
      label: "Characters To Pick",
      realmzField: "ID",
      targetFamily: "party-selection-count",
      defaultValue: 1,
      help: "Number of party members the player should pick for following steps."
    },
    defaultDraft: { rawCode: 14, id: 1 }
  },
  19: {
    storage: "data-edcd-parameter-row",
    edcdShape: "random-message",
    target: parameterRowTarget("Message Range"),
    defaultDraft: { rawCode: 19, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "First Message" },
      1: { label: "Last Message" }
    }
  },
  20: {
    storage: "data-edcd-parameter-row",
    edcdShape: "teleport",
    target: parameterRowTarget("Movement Settings"),
    defaultDraft: { rawCode: 20, id: 0, parameters: [-1, -1, -1, 0, 0] },
    parameterDefaults: [-1, -1, -1, 0, 0],
    parameters: {
      0: { label: "Land Level", targetFamily: "map-level", help: "-1 keeps the current land level; otherwise use the destination land level." },
      1: { label: "X Coordinate", help: "-1 keeps the current X coordinate." },
      2: { label: "Y Coordinate", help: "-1 keeps the current Y coordinate." },
      3: { label: "Sound" },
      4: { label: "Message" }
    }
  },
  23: {
    storage: "data-edcd-parameter-row",
    edcdShape: "random-region-mutation",
    target: parameterRowTarget("Random Encounter Area"),
    defaultDraft: { rawCode: 23, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "Land Level", targetFamily: "map-level" },
      1: { label: "Rectangle" },
      2: { label: "Chance Scale", help: "Encounter chance value in Realmz's 10,000-point scale." },
      3: { label: "Battle Low", targetFamily: "battle" },
      4: { label: "Battle High", targetFamily: "battle" }
    }
  },
  39: {
    storage: "data-ed3-direct",
    target: {
      label: "Extra Action Point",
      realmzField: "ID",
      targetFamily: "extra-action-point",
      defaultValue: 0,
      help: "Reusable action to run from here."
    },
    defaultDraft: { rawCode: 39, id: 0 }
  },
  62: {
    storage: "direct-code-id",
    target: {
      label: "Scrolling Text",
      realmzField: "ID",
      targetFamily: "scrolling-text",
      defaultValue: 0,
      help: "Scrolling text scene to display."
    },
    defaultDraft: { rawCode: 62, id: 0 }
  },
  45: {
    storage: "data-edcd-parameter-row",
    edcdShape: "teleport",
    target: parameterRowTarget("Movement Settings"),
    defaultDraft: { rawCode: 45, id: 0, parameters: [-1, -1, -1, 0, 0] },
    parameterDefaults: [-1, -1, -1, 0, 0],
    parameters: {
      0: { label: "Land Level", targetFamily: "map-level", help: "-1 keeps the current land level; otherwise use the destination land level." },
      1: { label: "X Coordinate", help: "-1 keeps the current X coordinate." },
      2: { label: "Y Coordinate", help: "-1 keeps the current Y coordinate." },
      3: { label: "Sound" },
      4: { label: "Message" }
    }
  },
  48: {
    storage: "data-edcd-parameter-row",
    edcdShape: "selective-battle",
    target: parameterRowTarget("Battle Settings"),
    defaultDraft: { rawCode: 48, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "Battle Low", targetFamily: "battle" },
      1: { label: "Battle High", targetFamily: "battle" },
      2: { label: "Sound" },
      3: { label: "Message" },
      4: { label: "Treasure On Victory" }
    }
  },
  56: {
    storage: "data-edcd-parameter-row",
    edcdShape: "battle-outcome-branch",
    target: parameterRowTarget("Battle Outcome"),
    defaultDraft: { rawCode: 56, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "Battle Low", targetFamily: "battle" },
      1: { label: "Battle High", targetFamily: "battle" },
      2: { label: "Flee Branch", targetFamily: "extra-action-point-or-encounter" },
      3: { label: "Sound" },
      4: { label: "Message" }
    }
  },
  92: {
    storage: "data-edcd-parameter-row",
    edcdShape: "random-region-shape-mutation",
    target: parameterRowTarget("Area Shape Settings"),
    defaultDraft: { rawCode: 92, id: 0, parameters: [0, 0, 0, 0, -1] },
    parameterDefaults: [0, 0, 0, 0, -1],
    parameters: {
      0: { label: "Level", targetFamily: "map-level" },
      1: { label: "Rectangle", targetFamily: "random-encounter-rectangle" },
      2: { label: "Map Kind", help: "0 targets land data; 1 targets dungeon data." },
      3: { label: "Encounter Percent Delta", help: "Signed encounter-percent delta using Realmz's base-10000 scale." },
      4: { label: "Shape Mode", help: "-1 keeps shape, 0 sets coordinates, 1 offsets the rectangle, 2 warps using the following settings row." }
    }
  },
  106: {
    storage: "data-edcd-parameter-row",
    edcdShape: "dark-level-state",
    target: parameterRowTarget("Darkness Settings"),
    defaultDraft: { rawCode: 106, id: 0, parameters: [2, 0, 0, 0, 0] },
    parameterDefaults: [2, 0, 0, 0, 0],
    parameters: {
      0: { label: "Light/Dark State", targetFamily: "dark-level-state", help: "1 makes the current land level light; 2 makes it dark." },
      1: { label: "Stop If Already Set", help: "1 skips the rest of the Action Point when the requested light/dark state is already active." }
    }
  },
  107: {
    storage: "data-edcd-parameter-row",
    edcdShape: "improved-selective-battle",
    target: parameterRowTarget("Battle Settings"),
    defaultDraft: { rawCode: 107, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "Battle Low", targetFamily: "battle" },
      1: { label: "Battle High", targetFamily: "battle" },
      2: { label: "Sound" },
      3: { label: "Message" },
      4: { label: "Flee Branch", targetFamily: "extra-action-point-or-encounter" }
    }
  },
  71: {
    storage: "direct-code-id",
    target: {
      label: "Coordinate Display",
      realmzField: "ID",
      targetFamily: "coordinate-display-state",
      defaultValue: 1,
      help: "0 hides the coordinate display; nonzero values show it."
    },
    defaultDraft: { rawCode: 71, id: 1 }
  },
  122: {
    storage: "data-edcd-parameter-row",
    edcdShape: "fumble",
    target: parameterRowTarget("Fumble Settings"),
    defaultDraft: { rawCode: 122, id: 0, parameters: [0, 0, 0, 0, 0] },
    parameterDefaults: [0, 0, 0, 0, 0],
    parameters: {
      0: { label: "Message" },
      1: { label: "Sound" }
    }
  }
};

const LEGACY_CATEGORY_MAP: Record<string, ScriptActionCategory> = {
  Text: "Dialogue",
  Branch: "Logic",
  Encounter: "Encounters",
  Combat: "Encounters",
  Economy: "Rewards",
  Map: "Travel",
  Media: "Media",
  Characters: "Party",
  Rules: "Rules",
  Quest: "Logic",
  Scenario: "Logic",
  Core: "Extra Action Points",
  Advanced: "Advanced",
  Unknown: "Advanced"
};

export const SCRIPT_ACTION_CATEGORIES = CATEGORY_ORDER;

export const SCRIPT_ACTION_DEFINITIONS: ScriptActionDefinition[] = ACTION_OPTIONS.map((option) => buildActionDefinition(option));

export const SCRIPT_ACTION_COVERAGE: ScriptActionCoverageEntry[] = SCRIPT_ACTION_DEFINITIONS.map((definition) => ({
  opcode: definition.opcode,
  label: definition.label,
  category: definition.category,
  authoringLevel: definition.authoringLevel,
  formKind: definition.formKind,
  targetMeaning: definition.target?.label ?? "No target",
  validationPosture: definition.validationPosture
}));

export const SCRIPT_STEP_FORM_DEFINITIONS: ScriptStepFormDefinition[] = SCRIPT_ACTION_DEFINITIONS.map((definition) => ({
  opcode: definition.opcode,
  kind: definition.formKind,
  title: definition.label,
  authoringLevel: definition.authoringLevel,
  targetLabel: definition.target?.label ?? "None",
  parameterLabels: definition.parameters.filter((parameter) => !parameter.preserved).map((parameter) => parameter.label)
}));

export function scriptActionDefinitionFor(rawCode: number): ScriptActionDefinition {
  const normalized = normalizeStepOpcode(rawCode);
  const known = SCRIPT_ACTION_DEFINITIONS.find((definition) => definition.opcode === normalized);
  if (known) return known;
  const option = actionOptionFor(rawCode);
  return buildActionDefinition(option, true);
}

export function actionDefinitionsForCategory(category: ScriptActionCategory, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  return SCRIPT_ACTION_DEFINITIONS.filter((definition) => {
    if (definition.authoringLevel === "ignored") return false;
    if (definition.category !== category) return false;
    if (!normalizedQuery) return true;
    return actionDefinitionSearchText(definition).includes(normalizedQuery);
  });
}

export function actionDefinitionSearchText(definition: ScriptActionDefinition) {
  return [
    definition.opcode,
    definition.label,
    definition.shortLabel,
    definition.summary,
    definition.description,
    definition.categoryLabel,
    definition.realmzOptionLabel,
    definition.storage,
    definition.edcdShape,
    definition.target?.label,
    definition.target?.targetFamily,
    definition.target?.help,
    definition.parameters.map((parameter) => [
      parameter.label,
      parameter.internalName,
      parameter.targetFamily,
      parameter.help,
      parameter.preserved ? "preserved" : ""
    ].filter(Boolean).join(" ")).join(" "),
    definition.searchTerms.join(" ")
  ].join(" ").toLowerCase();
}

export function scriptActionSummary(
  project: Project | null,
  catalog: LibraryCatalog | null | undefined,
  draft: ScriptStepDraft,
  emptyLabel = "Empty step"
) {
  const definition = scriptActionDefinitionFor(draft.rawCode);
  const code = normalizeStepOpcode(draft.rawCode);
  if (code === 0) return emptyLabel;
  const shouldResolveDirectTarget = Boolean(definition.target && definition.target.targetFamily !== "parameter-row");
  const target = shouldResolveDirectTarget
    ? targetOptionForOpcodeValue(project, draft.rawCode, draft.id, catalog)
    : null;
  if (target) {
    const behavior = signedTargetBehaviorLabel(draft.rawCode, draft.id);
    return `${definition.shortLabel}: ${targetSummary(definition.target?.targetFamily, target.label, target.detail)}${behavior ? ` · ${behavior}` : ""}`;
  }
  const settingsSummary = summarizeSettingsBackedAction(project, catalog, definition, draft);
  if (settingsSummary) return settingsSummary;
  if (definition.target) {
    if (draft.id === 0) return `${definition.shortLabel}: choose ${definition.target.label.toLowerCase()}`;
    return `${definition.shortLabel}: ${definition.target.label} ${draft.id}`;
  }
  if (definition.parameters.length > 0) return `${definition.shortLabel}: settings ${draft.id}`;
  return definition.shortLabel;
}

export function scriptStepBranchHint(rawCode: number, id: number) {
  const code = normalizeStepOpcode(rawCode);
  if (code === 3) return "Routes the player's choice.";
  if (code === 8) return `Runs same-map Action Point ${id}.`;
  if (code === 39) return `Runs Extra Action Point ${id}.`;
  if ([38, 46, 58, 59, 72, 75, 77, 78, 81, 85, 86, 87].includes(code)) return "Routes the script based on a condition or result.";
  if ([2, 48, 56, 107].includes(code)) return "May route based on battle setup or outcome.";
  if ([111, 112].includes(code)) return "Returns from Extra Action Point flow.";
  return "";
}

export function scriptStepFlowRoutes(
  project: Project | null,
  catalog: LibraryCatalog | null | undefined,
  draft: ScriptStepDraft
): ScriptFlowPreviewRoute[] {
  const code = normalizeStepOpcode(draft.rawCode);
  const definition = scriptActionDefinitionFor(code);
  const values = settingsValues(project, draft);
  const routes: ScriptFlowPreviewRoute[] = [];
  if (code === 0) return routes;
  if (code === 3 && values) {
    const continueSide = values[0] === 0 ? "Right / No" : "Left / Yes";
    const branchMode = values[1] ?? 0;
    routes.push({ kind: "continues", label: `${continueSide} continues`, detail: "The other answer follows the branch behavior." });
    const branchKind = choiceBranchKindLabel(branchMode);
    if (branchKind) {
      const targetKind = choiceBranchTargetKind(branchMode);
      routes.push({
        kind: "branch",
        label: choiceBranchModeLabel(branchMode),
        detail: branchKind,
        target: targetKind ? targetRoute(project, targetKind, values[2] ?? 0) ?? undefined : undefined
      });
    } else {
      routes.push({ kind: branchMode === 4 ? "stops" : "branch", label: choiceBranchModeLabel(branchMode), detail: choiceBranchModeDetail(branchMode) });
    }
    return routes;
  }
  if (code === 8) {
    routes.push({ kind: "call", label: "Same-map Action Point", detail: `Runs Action Point ${draft.id} from this map.` });
    return routes;
  }
  if (code === 39) {
      routes.push({ kind: "call", label: "Extra Action Point", detail: targetRoute(project, "macro", draft.id, catalog)?.detail ?? `Runs Extra Action Point ${draft.id}.`, target: targetRoute(project, "macro", draft.id, catalog) ?? undefined });
    return routes;
  }
  if ([38, 46, 58, 59, 42, 72, 75, 77, 78, 81, 85, 86, 87].includes(code)) {
    routes.push({ kind: "branch", label: definition.shortLabel, detail: summarizeSettingsBackedAction(project, catalog, definition, draft) || "Routes to another result when its condition matches." });
  }
  if ([2, 48, 56, 107].includes(code)) {
    routes.push({ kind: "outcome", label: definition.shortLabel, detail: summarizeSettingsBackedAction(project, catalog, definition, draft) || "May start a battle or route from a battle outcome." });
  }
  if ([111, 112].includes(code)) {
    routes.push({ kind: "stops", label: definition.shortLabel, detail: "Returns from Extra Action Point flow." });
  }
  return routes;
}

function summarizeSettingsBackedAction(
  project: Project | null,
  catalog: LibraryCatalog | null | undefined,
  definition: ScriptActionDefinition,
  draft: ScriptStepDraft
) {
  const code = normalizeStepOpcode(draft.rawCode);
  const values = settingsValues(project, draft);
  if (!values && definition.target?.targetFamily === "parameter-row") {
    return draft.id === 0 ? `${definition.shortLabel}: choose settings` : `${definition.shortLabel}: settings ${draft.id}`;
  }
  if (!values) return "";
  if (code === 3) {
    const left = promptSummary(project, values[3] ?? 0);
    const right = promptSummary(project, values[4] ?? 0);
    return `Ask Choice: ${left} / ${right}`;
  }
  if (code === 19) {
    const low = values[0] ?? 0;
    const high = values[1] ?? low;
    return low === high ? `Random Message: ${messageLabel(project, low)}` : `Random Message: ${messageLabel(project, low)}-${messageLabel(project, high)}`;
  }
  if (code === 20 || code === 45) {
    return `${definition.shortLabel}: ${mapLevelLabel(project, values[0] ?? -1)}, ${coordinateLabel(values[1])}, ${coordinateLabel(values[2])}`;
  }
  if ([2, 48, 56, 107].includes(code)) {
    return `${definition.shortLabel}: ${rangeTargetSummary(project, "battle", values[0] ?? 0, values[1] ?? 0)}`;
  }
  if (code === 92 || code === 23 || code === -23) {
    return `${definition.shortLabel}: ${mapLevelLabel(project, values[0] ?? 0)}, rectangle ${values[1] ?? 0}`;
  }
  if (code === 106) {
    const state = values[0] === 1 ? "light" : values[0] === 2 ? "dark" : `state ${values[0] ?? 0}`;
    return `Darkness: set ${state}`;
  }
  if (code === 122) {
    return `Fumble: ${messageLabel(project, values[0] ?? 0)}${values[1] ? `, sound ${values[1]}` : ""}`;
  }
  const fieldSummaries = definition.parameters
    .filter((parameter) => !parameter.preserved)
    .slice(0, 3)
    .map((parameter) => {
      const value = values[parameter.index] ?? 0;
      return `${parameter.label} ${targetValueSummary(project, catalog, definition, parameter, value)}`;
    });
  return fieldSummaries.length > 0 ? `${definition.shortLabel}: ${fieldSummaries.join(", ")}` : "";
}

function settingsValues(project: Project | null, draft: ScriptStepDraft): number[] | null {
  if (draft.parameters) return [...draft.parameters];
  if (!project) return null;
  const row = project.extracodes.find((candidate) => candidate.id === Math.max(0, draft.id));
  return row?.values ?? null;
}

function targetValueSummary(
  project: Project | null,
  catalog: LibraryCatalog | null | undefined,
  definition: ScriptActionDefinition,
  parameter: ScriptParameterFieldDefinition,
  value: number
) {
  if (parameter.targetFamily === "map-level") return mapLevelLabel(project, value);
  if (parameter.targetFamily === "message") return messageLabel(project, value);
  if (parameter.targetFamily === "battle") return targetRoute(project, "battle", Math.abs(value), catalog)?.label ?? String(value);
  const targetKind = edcdFieldTargetKind(definition.edcdShape ?? "", parameter.internalName, definition.parameters.map((field) => field.internalName), [value], definition.opcode);
  if (targetKind) return targetRoute(project, targetKind, value, catalog)?.label ?? String(value);
  if (definition.target?.targetFamily && definition.target.targetFamily !== "parameter-row") {
    const target = targetOptionForOpcodeValue(project, definition.opcode, value, catalog);
    if (target) {
      const behavior = signedTargetBehaviorLabel(definition.opcode, value);
      return `${targetSummary(definition.target.targetFamily, target.label, target.detail)}${behavior ? ` · ${behavior}` : ""}`;
    }
  }
  return String(value);
}

function targetSummary(targetFamily: string | undefined, label: string, detail: string) {
  if (targetFamily === "message" && detail && detail !== "empty") return `"${clip(detail, 68)}"`;
  return label;
}

function rangeTargetSummary(project: Project | null, targetKind: EdcdTargetKind, low: number, high: number) {
  const absoluteLow = Math.abs(low);
  const absoluteHigh = Math.abs(high || low);
  const lowLabel = targetRoute(project, targetKind, absoluteLow)?.label ?? String(absoluteLow);
  const highLabel = targetRoute(project, targetKind, absoluteHigh)?.label ?? String(absoluteHigh);
  return absoluteLow === absoluteHigh ? lowLabel : `${lowLabel} through ${highLabel}`;
}

function targetRoute(project: Project | null, targetKind: EdcdTargetKind, value: number, catalog?: LibraryCatalog | null): ScriptTargetRoute | null {
  if (!project || !Number.isFinite(value)) return null;
  const option = edcdTargetOptions(project, targetKind, catalog).find((candidate) => candidate.value === Math.abs(value));
  if (!option) return null;
  return {
    label: option.label,
    targetKind,
    value: option.value,
    detail: option.detail
  };
}

function promptSummary(project: Project | null, value: number) {
  const prompt = parseChoicePromptValue(value);
  if (prompt.kind === "default") return "Yes/No";
  if (prompt.kind === "message") return messageLabel(project, prompt.id);
  const label = project?.optionLabels?.find((record) => record.id === prompt.id);
  return label?.text ? `"${clip(label.text, 48)}"` : `Option Label ${prompt.id}`;
}

function messageLabel(project: Project | null, value: number) {
  const id = Math.abs(value);
  if (id === 0) return "No message";
  const message = project?.messages?.find((record) => record.id === id);
  return message?.text ? `"${clip(message.text, 48)}"` : `Message ${id}`;
}

function mapLevelLabel(project: Project | null, value: number) {
  if (value < 0) return "current level";
  const map = project?.maps.find((candidate) => candidate.index === value);
  return map?.name ?? `Land ${value}`;
}

function coordinateLabel(value: number | undefined) {
  if (value == null || value < 0) return "current cell";
  return String(value);
}

function choiceBranchKindLabel(branchMode: number) {
  if (branchMode === 1) return "Branch to an Extra Action Point.";
  if (branchMode === 2) return "Branch to a simple encounter result.";
  if (branchMode === 3) return "Branch to a complex encounter result.";
  return "";
}

function choiceBranchModeDetail(branchMode: number) {
  if (branchMode === -1) return "Both answers continue.";
  if (branchMode === 0) return "The party backs up one step.";
  if (branchMode === 4) return "The Action Point is eliminated and the script stops.";
  return "Imported branch behavior kept available in Technical Details.";
}

function clip(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1))}...` : clean;
}

function buildActionDefinition(option: RealmzActionOption, forceAdvanced = false): ScriptActionDefinition {
  const code = normalizeStepOpcode(option.code);
  const override = ACTION_OVERRIDES[code];
  const metadata = ACTION_METADATA_OVERRIDES[code];
  const targetConfig = targetPickerConfig(code);
  const crosswalk = crosswalkForOpcode(code);
  const baseCategory = forceAdvanced
    ? "Advanced"
    : override?.category ?? LEGACY_CATEGORY_MAP[option.category] ?? "Advanced";
  const hasGenericOpcodeLabel = !override?.label && /^Opcode\b/i.test(option.shortLabel);
  const authoringLevel = authoringLevelFor(code, baseCategory, option, forceAdvanced || hasGenericOpcodeLabel);
  const category: ScriptActionCategory = authoringLevel === "advanced" ? "Advanced" : baseCategory;
  const parameterDefaults = metadata?.parameterDefaults;
  const parameters = parameterLabelsForOpcode(code).map((parameter) => ({
    index: parameter.index,
    label: metadata?.parameters?.[parameter.index]?.label ?? parameter.label,
    help: metadata?.parameters?.[parameter.index]?.help ?? parameter.help,
    internalName: metadata?.parameters?.[parameter.index]?.internalName ?? parameter.internalName,
    targetFamily: metadata?.parameters?.[parameter.index]?.targetFamily ?? parameter.targetFamily,
    defaultValue: metadata?.parameters?.[parameter.index]?.defaultValue ?? parameterDefaults?.[parameter.index] ?? 0,
    preserved: metadata?.parameters?.[parameter.index]?.preserved ?? parameter.preserved
  }));
  const target = metadata?.target
    ? completeTargetDefinition(metadata.target, crosswalk?.targetFamily ?? undefined)
    : targetConfig
      ? completeTargetDefinition({
        label: humanTargetLabel(targetConfig.label),
        help: targetConfig.hint,
        createLabel: targetConfig.recordType ? `Create ${humanTargetLabel(targetConfig.label)}` : undefined
      }, crosswalk?.targetFamily ?? undefined)
      : option.edcdShape
        ? parameterRowTarget()
        : undefined;
  const storage = metadata?.storage ?? inferredStorage(code, option);
  const preservedLabel = isDispatcherNoopOpcode(code) ? `Unknown Opcode ${code}` : `Unmodeled Action ${code}`;
  const preservedShortLabel = isDispatcherNoopOpcode(code) ? "Unknown Opcode" : "Unmodeled Action";
  const usesOfficialManualTitle = Boolean(option.officialTitle && option.displayTitle === option.officialTitle);
  const description = hasGenericOpcodeLabel
    ? isDispatcherNoopOpcode(code)
      ? "Providence keeps this opcode available for inspection, but classic Realmz does not expose a normal authoring path for it."
      : "Providence recognizes this script row, but it does not have a complete friendly editor yet."
    : override?.description ?? option.description;
  const label = hasGenericOpcodeLabel
    ? preservedLabel
    : usesOfficialManualTitle
      ? option.displayTitle
      : override?.label ?? option.displayTitle;
  const shortLabel = hasGenericOpcodeLabel
    ? preservedShortLabel
    : usesOfficialManualTitle
      ? option.displayTitle
      : override?.shortLabel ?? option.displayTitle;
  const formKind = formKindFor(code, category, storage, metadata?.edcdShape ?? option.edcdShape, target?.targetFamily);
  return {
    opcode: code,
    label,
    shortLabel,
    category,
    categoryLabel: category,
    summary: description,
    description,
    realmzOptionLabel: option.label,
    storage,
    edcdShape: metadata?.edcdShape ?? option.edcdShape,
    searchTerms: [
      option.label,
      option.shortLabel,
      option.displayTitle,
      option.officialTitle,
      option.aliasTitle,
      option.category,
      crosswalk?.title,
      crosswalk?.idMeaning,
      crosswalk?.targetFamily,
      ...(override?.searchTerms ?? [])
    ].filter(Boolean) as string[],
    target,
    parameters,
    defaultDraft: metadata?.defaultDraft ?? {
      rawCode: code,
      id: 0,
      parameters: parameterDefaults ?? (option.edcdShape ? [0, 0, 0, 0, 0] : undefined)
    },
    advanced: category === "Advanced" || forceAdvanced,
    authoringLevel,
    validationPosture: validationPostureFor(authoringLevel, storage, option.edcdShape, target),
    formKind
  };
}

function authoringLevelFor(code: number, category: ScriptActionCategory, option: RealmzActionOption, forceAdvanced: boolean): ScriptActionAuthoringLevel {
  if (IGNORED_ACTIONS.has(code)) return "ignored";
  if (forceAdvanced || ADVANCED_ACTIONS.has(code) || category === "Advanced" || option.category === "Unknown") return "advanced";
  if (FIRST_CLASS_ACTIONS.has(code)) return "first-class";
  return "guided";
}

function validationPostureFor(
  authoringLevel: ScriptActionAuthoringLevel,
  storage: ScriptActionStorage,
  edcdShape: string | undefined,
  target: ScriptTargetFieldDefinition | undefined
): ScriptActionValidationPosture {
  if (authoringLevel === "ignored") return "no-effect";
  if (authoringLevel === "advanced") return "advanced-import";
  if (edcdShape || storage === "data-edcd-parameter-row" || target?.targetFamily === "parameter-row") return "validated-settings";
  return "validated-targets";
}

function formKindFor(
  code: number,
  category: ScriptActionCategory,
  storage: ScriptActionStorage,
  edcdShape: string | undefined,
  targetFamily: string | undefined
): ScriptStepFormKind {
  if (IGNORED_ACTIONS.has(code)) return "advanced";
  if (category === "Advanced") return "advanced";
  if (code === 3 || edcdShape === "choice") return "choice";
  if (targetFamily === "message" || edcdShape === "random-message") return "message";
  if (targetFamily === "extra-action-point" || storage === "data-ed3-direct" || storage === "same-map-action-point-copy") return "reusable-action";
  if (["battle", "selective-battle", "battle-outcome-branch", "improved-selective-battle"].includes(edcdShape ?? "") || [2, 48, 56, 107].includes(code)) return "battle";
  if (category === "Encounters") return "encounter";
  if (category === "Travel") return "movement";
  if (category === "Rewards" || category === "Items") return "reward";
  if (category === "Party") return "party";
  if (category === "Rules") return "rules";
  if (category === "Media" || targetFamily === "picture" || targetFamily === "sound") return "media";
  if (category === "Logic") return "logic";
  return edcdShape ? "guided-settings" : "advanced";
}

function parameterRowTarget(label = "Settings"): ScriptTargetFieldDefinition {
  return {
    label,
    help: "Pick or create the settings used by this action.",
    realmzField: "ID",
    targetFamily: "parameter-row",
    defaultValue: 0
  };
}

function completeTargetDefinition(
  partial: Partial<ScriptTargetFieldDefinition>,
  fallbackFamily = "direct-id"
): ScriptTargetFieldDefinition {
  const label = partial.label ?? "Target";
  return {
    label,
    help: partial.help ?? "",
    realmzField: partial.realmzField ?? "ID",
    targetFamily: partial.targetFamily ?? fallbackFamily,
    defaultValue: partial.defaultValue ?? 0,
    createLabel: partial.createLabel,
    allowsNegative: partial.allowsNegative
  };
}

function inferredStorage(code: number, option: RealmzActionOption): ScriptActionStorage {
  if (option.edcdShape) return "data-edcd-parameter-row";
  if (code === 8) return "same-map-action-point-copy";
  if (code === 39) return "data-ed3-direct";
  return "direct-code-id";
}

function humanTargetLabel(label: string) {
  return label
    .replace(/\bTarget\b/g, "")
    .replace(/\bResource\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
