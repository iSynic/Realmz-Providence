export type RealmzActionOption = {
  code: number;
  label: string;
  shortLabel: string;
  category: string;
  description: string;
  edcdShape?: string;
};

const DOCUMENTED_OPCODE_CODES = [
  -23,
  -14,
  0,
  ...range(1, 78),
  ...range(81, 108),
  111,
  112,
  ...range(119, 127)
];

const ACTION_DETAILS: Record<number, Partial<RealmzActionOption>> = {
  [-23]: { shortLabel: "Dungeon Random Region", category: "Encounter", description: "Mutate dungeon random encounter rectangle data.", edcdShape: "random-region-mutation" },
  [-14]: { shortLabel: "Pick Inverse Characters", category: "Characters", description: "Select the inverse of the current character set." },
  0: { shortLabel: "Empty", category: "Core", description: "Clear this slot; Realmz will skip it." },
  1: { shortLabel: "Message", category: "Text", description: "Display a scenario message by ID." },
  2: { shortLabel: "Battle", category: "Combat", description: "Start a battle record or battle range.", edcdShape: "battle" },
  3: { shortLabel: "Choice", category: "Branch", description: "Prompt or branch using EDCD parameters.", edcdShape: "choice" },
  4: { shortLabel: "Simple Encounter", category: "Encounter", description: "Start a simple encounter." },
  5: { shortLabel: "Complex Encounter", category: "Encounter", description: "Start a complex encounter." },
  6: { shortLabel: "Shop", category: "Economy", description: "Open a shop by ID." },
  7: { shortLabel: "Patch Actions", category: "Advanced", description: "Copy or patch action data through EDCD parameters.", edcdShape: "action-data-patching" },
  8: { shortLabel: "Same AP", category: "Branch", description: "Copy action slots from another Action Point on the current map." },
  9: { shortLabel: "Sound", category: "Media", description: "Play a snd resource." },
  10: { shortLabel: "Treasure", category: "Economy", description: "Give treasure or reward data." },
  11: { shortLabel: "Victory Points", category: "Economy", description: "Give victory points to the party." },
  12: { shortLabel: "Tile Patch", category: "Map", description: "Mutate land/dungeon tile data.", edcdShape: "tile-mutation" },
  13: { shortLabel: "AP State", category: "Map", description: "Enable, disable, or mutate an Action Point.", edcdShape: "trigger-mutation" },
  14: { shortLabel: "Pick Characters", category: "Characters", description: "Ask the player to pick party members for following steps." },
  15: { shortLabel: "Damage", category: "Characters", description: "Damage selected characters or party through EDCD roll fields.", edcdShape: "damage-heal" },
  16: { shortLabel: "Heal", category: "Characters", description: "Heal selected characters or party through EDCD roll fields.", edcdShape: "damage-heal" },
  17: { shortLabel: "Cast Spell", category: "Rules", description: "Cast a spell using EDCD spell parameters.", edcdShape: "spell-cast" },
  18: { shortLabel: "Force Spell", category: "Rules", description: "Cast or force a spell through EDCD spell parameters.", edcdShape: "spell-cast" },
  19: { shortLabel: "Random Message", category: "Text", description: "Display a random scenario message from an EDCD range.", edcdShape: "random-message" },
  20: { shortLabel: "Teleport", category: "Map", description: "Move the party to a level/cell.", edcdShape: "teleport" },
  21: { shortLabel: "Item Branch", category: "Economy", description: "Branch based on item possession or missing-item behavior.", edcdShape: "item-branch" },
  22: { shortLabel: "Item Mutation", category: "Economy", description: "Drop, charge, or replace item data.", edcdShape: "item-mutation" },
  23: { shortLabel: "Random Region", category: "Encounter", description: "Patch random encounter rectangle data.", edcdShape: "random-region-mutation" },
  24: { shortLabel: "Keep Codes", category: "Branch", description: "Keep evaluating following action slots." },
  27: { shortLabel: "Picture", category: "Media", description: "Show a PICT resource." },
  29: { shortLabel: "Map Item", category: "Map", description: "Give or display map-related data." },
  30: { shortLabel: "Pick By Check", category: "Characters", description: "Select characters by ability or attribute check.", edcdShape: "ability-check-pick" },
  31: { shortLabel: "Check Branch", category: "Branch", description: "Branch based on an ability or attribute check.", edcdShape: "ability-check-branch" },
  33: { shortLabel: "Gold", category: "Economy", description: "Take or check gold through EDCD amount fields.", edcdShape: "gold" },
  35: { shortLabel: "Encounter State", category: "Encounter", description: "Mutate simple encounter state." },
  37: { shortLabel: "Dungeon Move", category: "Map", description: "Move in dungeon coordinates through EDCD fields.", edcdShape: "dungeon-move" },
  38: { shortLabel: "Force Branch", category: "Branch", description: "Branch to macro/simple/complex targets through EDCD.", edcdShape: "force-branch" },
  39: { shortLabel: "Extend Codes", category: "Branch", description: "Call an Extra Action Point row directly." },
  40: { shortLabel: "Condition Branch", category: "Branch", description: "Branch based on party condition state.", edcdShape: "party-condition-branch" },
  41: { shortLabel: "Encounter Mutation", category: "Encounter", description: "Clear or mutate simple encounter choice state.", edcdShape: "encounter-mutation" },
  42: { shortLabel: "Percent Branch", category: "Branch", description: "Branch based on a percent roll.", edcdShape: "percent-branch" },
  43: { shortLabel: "Condition", category: "Characters", description: "Give or alter party/character condition state.", edcdShape: "condition" },
  45: { shortLabel: "Teleport Only", category: "Map", description: "Teleport without the arrival trigger behavior of opcode 20.", edcdShape: "teleport" },
  46: { shortLabel: "Force Branch", category: "Branch", description: "Force branch using EDCD target fields.", edcdShape: "force-branch" },
  47: { shortLabel: "Set Quest Flag", category: "Quest", description: "Set a quest flag." },
  48: { shortLabel: "Selective Battle", category: "Combat", description: "Start a selective battle with optional sound, message, and treasure.", edcdShape: "selective-battle" },
  49: { shortLabel: "Shop", category: "Economy", description: "Open or route to a shop record." },
  50: { shortLabel: "Race/Caste Pick", category: "Characters", description: "Pick characters by race, caste, class, or gender.", edcdShape: "race-caste-gender-selector" },
  51: { shortLabel: "Shop Mutation", category: "Economy", description: "Alter shop inflation or stock fields.", edcdShape: "shop-mutation" },
  52: { shortLabel: "Character Selector", category: "Characters", description: "Select characters by movement, position, item, saves, or similar state.", edcdShape: "character-selector" },
  53: { shortLabel: "Caste Selector", category: "Characters", description: "Select characters by exact caste or caste group.", edcdShape: "caste-selector" },
  54: { shortLabel: "Timed Encounter", category: "Encounter", description: "Mutate timed encounter schedule/state.", edcdShape: "timed-encounter-mutation" },
  55: { shortLabel: "Picked Branch", category: "Branch", description: "Branch based on whether characters are currently picked.", edcdShape: "picked-branch" },
  56: { shortLabel: "Battle Outcome", category: "Combat", description: "Start a battle and optionally branch if the party flees.", edcdShape: "battle-outcome-branch" },
  57: { shortLabel: "Landlook", category: "Map", description: "Change map render/landlook state.", edcdShape: "render-mutation" },
  58: { shortLabel: "Force Branch", category: "Branch", description: "Force branch using EDCD target fields.", edcdShape: "force-branch" },
  59: { shortLabel: "Force Branch", category: "Branch", description: "Force branch using EDCD target fields.", edcdShape: "force-branch" },
  60: { shortLabel: "Money State", category: "Economy", description: "Clear or mutate party money state.", edcdShape: "party-money-state" },
  61: { shortLabel: "Position Shift", category: "Map", description: "Shift current party position.", edcdShape: "position-shift" },
  62: { shortLabel: "Scrolling Text", category: "Text", description: "Display a scrolling text scene by ID." },
  63: { shortLabel: "Time", category: "Scenario", description: "Set or offset game time.", edcdShape: "time-mutation" },
  64: { shortLabel: "Game Time Branch", category: "Branch", description: "Branch based on current game day and hour.", edcdShape: "game-time-branch" },
  65: { shortLabel: "Random Items", category: "Economy", description: "Give a random item range.", edcdShape: "random-items" },
  67: { shortLabel: "Charge Branch", category: "Economy", description: "Branch based on item charges.", edcdShape: "item-charge-branch" },
  68: { shortLabel: "Fatigue", category: "Characters", description: "Alter party or character fatigue.", edcdShape: "fatigue" },
  69: { shortLabel: "Spell Flags", category: "Rules", description: "Set combat spellcasting flags.", edcdShape: "spell-flags" },
  70: { shortLabel: "Save/Restore Pos", category: "Map", description: "Save or restore party position.", edcdShape: "save-restore-position" },
  71: { shortLabel: "Coordinate Display", category: "Map", description: "Show or hide the coordinate display." },
  72: { shortLabel: "Range Branch", category: "Branch", description: "Branch to a target based on EDCD range/test fields.", edcdShape: "range-branch" },
  73: { shortLabel: "Restricted Shop", category: "Economy", description: "Open a restricted shop variant.", edcdShape: "restricted-shop" },
  74: { shortLabel: "Spell Points", category: "Rules", description: "Alter spell points by roll/range.", edcdShape: "spell-points" },
  75: { shortLabel: "Range Branch", category: "Branch", description: "Branch to a target based on EDCD range/test fields.", edcdShape: "range-branch" },
  76: { shortLabel: "Quest Value", category: "Quest", description: "Write quest value data.", edcdShape: "quest-value" },
  77: { shortLabel: "Quest Branch", category: "Quest", description: "Branch on quest value data.", edcdShape: "false-true-branch" },
  78: { shortLabel: "True/False Branch", category: "Branch", description: "Branch using separate false/true EDCD targets.", edcdShape: "false-true-branch" },
  81: { shortLabel: "Condition Branch", category: "Branch", description: "Branch to macros based on condition state.", edcdShape: "condition-branch" },
  84: { shortLabel: "Registration", category: "Scenario", description: "Legacy registration check." },
  85: { shortLabel: "Random Branch", category: "Branch", description: "Branch to a random target in range.", edcdShape: "random-branch" },
  86: { shortLabel: "Misc Branch", category: "Branch", description: "Branch based on party, race, caste, gender, boat, camp, or level tests.", edcdShape: "misc-conditional-branch" },
  87: { shortLabel: "Conditional Branch", category: "Branch", description: "Branch based on conditional EDCD tests, with message behavior in some cases.", edcdShape: "conditional-branch" },
  90: { shortLabel: "Party State", category: "Characters", description: "Alter victory/experience-style party state.", edcdShape: "party-state" },
  92: { shortLabel: "Random Rect Shape", category: "Encounter", description: "Mutate random rectangle percent and shape using a secondary EDCD row.", edcdShape: "random-region-shape-mutation" },
  97: { shortLabel: "Map Record", category: "Map", description: "Use or reference map record data." },
  98: { shortLabel: "Reg Check", category: "Scenario", description: "Legacy registration choke point." },
  99: { shortLabel: "Reg Gate", category: "Scenario", description: "Legacy registration gate." },
  103: { shortLabel: "Boat/Camp State", category: "Scenario", description: "Mutate boat/camp runtime state.", edcdShape: "boat-camp-state" },
  104: { shortLabel: "Encounter Status", category: "Encounter", description: "Set encounter status." },
  106: { shortLabel: "Dark Level State", category: "Map", description: "Set outdoor darkness state.", edcdShape: "dark-level-state" },
  107: { shortLabel: "Selective Battle", category: "Combat", description: "Start an improved selective battle and optionally branch if the party flees.", edcdShape: "improved-selective-battle" },
  108: { shortLabel: "Selected Character", category: "Characters", description: "Alter selected-character combat/stat fields.", edcdShape: "selected-character-state" },
  111: { shortLabel: "Return", category: "Core", description: "Return from a GOSUB macro." },
  112: { shortLabel: "Pop", category: "Core", description: "Pop script stack state." },
  120: { shortLabel: "Combat Monster", category: "Combat", description: "Alter combat monster id/count/icon state.", edcdShape: "combat-monster-mutation" },
  121: { shortLabel: "De-animate Undead", category: "Combat", description: "Source loads EDCD before destroying lower-level undead.", edcdShape: "unused-edcd-load" },
  122: { shortLabel: "Fumble", category: "Combat", description: "Show combat fumble message/sound behavior.", edcdShape: "fumble" },
  123: { shortLabel: "Rout", category: "Combat", description: "Cause matching active combat monsters to rout.", edcdShape: "rout" },
  124: { shortLabel: "Spawn", category: "Combat", description: "Spawn combat monsters using EDCD fields.", edcdShape: "spawn" },
  125: { shortLabel: "Destroy Related", category: "Combat", description: "Destroy related combat monsters.", edcdShape: "destroy-related" },
  126: { shortLabel: "Battle Macro", category: "Combat", description: "Call battle macro behavior.", edcdShape: "battle-macro" }
};

export const ACTION_OPTIONS: RealmzActionOption[] = DOCUMENTED_OPCODE_CODES.map((code) => {
  const detail = ACTION_DETAILS[code];
  const shortLabel = detail?.shortLabel ?? `Opcode ${code}`;
  return {
    code,
    label: `${code} ${shortLabel}`,
    shortLabel,
    category: detail?.category ?? "Advanced",
    description: detail?.description ?? "Documented Realmz opcode. Use raw CODE/ID and the details inspector for advanced fields.",
    edcdShape: detail?.edcdShape
  };
});

export const ACTION_CATEGORIES = Array.from(new Set(ACTION_OPTIONS.map((option) => option.category)));

export function actionOptionFor(rawCode: number): RealmzActionOption {
  const normalizedCode = normalizeStepOpcode(rawCode);
  const known = ACTION_OPTIONS.find((option) => option.code === normalizedCode);
  if (known) return known;
  if (isDispatcherNoopOpcode(rawCode)) {
    return {
      code: normalizedCode,
      label: `${rawCode} Dispatcher No-op`,
      shortLabel: "Dispatcher No-op",
      category: "Advanced",
      description: "Realmz reads this nonzero CODE value but newland.c has no dispatcher case, so the slot is ignored at runtime."
    };
  }
  return {
    code: normalizedCode,
    label: `${rawCode} Unknown`,
    shortLabel: `Opcode ${rawCode}`,
    category: "Unknown",
    description: "Unsupported or archaeology-only opcode. Keep visible and inspect raw fields."
  };
}

export function normalizeStepOpcode(code: number) {
  if (code < 0 && code !== -14 && code !== -23) return -code;
  return code;
}

export function hasNewlandDispatcherCase(code: number) {
  return ACTION_OPTIONS.some((option) => option.code === normalizeStepOpcode(code));
}

export function isDispatcherNoopOpcode(code: number) {
  const normalized = normalizeStepOpcode(code);
  return normalized !== 0 && !hasNewlandDispatcherCase(normalized);
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
