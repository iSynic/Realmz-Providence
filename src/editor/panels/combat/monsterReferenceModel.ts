export type CombatSelectOption = {
  key: string;
  value: number;
  label: string;
  detail?: string;
};

export const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
export const MONSTER_REQUIRED_WEAPON_HELP = "Realmz checks this monster record byte before allowing weapon hits: All is 0, Blunt only is -1, Sharp only is -2, and positive codes match the attacker's weapon number. Divinity fixture evidence shows the adjacent Req Weap value writes Data MD rel 7.";
export const MONSTER_SUMMON_ELIGIBLE_HELP = "Divinity labels this as Can Be Summoned. Realmz random-summon paths require 1, ordinary monsters are 0, and -1 is the NPC/ally marker.";

export const MONSTER_SUMMON_ELIGIBLE_OPTIONS: CombatSelectOption[] = [
  { key: "summon-eligible:yes", value: 1, label: "1 = Yes", detail: "Runtime-proven: random summon selection requires cansum == 1." },
  { key: "summon-eligible:npc", value: -1, label: "-1 = Is a NPC", detail: "Runtime-proven: Realmz uses -1 for special NPC/ally handling." }
];

export const MONSTER_ATTACK_FORM_OPTIONS: CombatSelectOption[] = [
  { key: "attack-form:32", value: 32, label: "Pummel" },
  { key: "attack-form:33", value: 33, label: "Claw" },
  { key: "attack-form:34", value: 34, label: "Bite" },
  { key: "attack-form:35", value: 35, label: "Not Used" },
  { key: "attack-form:36", value: 36, label: "Not Used" },
  { key: "attack-form:37", value: 37, label: "Not Used" },
  { key: "attack-form:38", value: 38, label: "Punch / Kick" },
  { key: "attack-form:39", value: 39, label: "Club" },
  { key: "attack-form:40", value: 40, label: "Slime" },
  { key: "attack-form:41", value: 41, label: "Sting" }
];

export const MONSTER_ATTACK_SPECIAL_OPTIONS: CombatSelectOption[] = [
  { key: "attack-special:0", value: 0, label: "No Special Attacks" },
  { key: "attack-special:1", value: 1, label: "Cause Fear" },
  { key: "attack-special:2", value: 2, label: "Paralyze" },
  { key: "attack-special:3", value: 3, label: "Curse" },
  { key: "attack-special:4", value: 4, label: "Stupify" },
  { key: "attack-special:5", value: 5, label: "Entangle" },
  { key: "attack-special:6", value: 6, label: "Poison" },
  { key: "attack-special:7", value: 7, label: "Confuse" },
  { key: "attack-special:8", value: 8, label: "Drain Spell Points" },
  { key: "attack-special:9", value: 9, label: "Drain Experience" },
  { key: "attack-special:10", value: 10, label: "Charm" },
  { key: "attack-special:11", value: 11, label: "Fire Damage" },
  { key: "attack-special:12", value: 12, label: "Cold Damage" },
  { key: "attack-special:13", value: 13, label: "Electric Damage" },
  { key: "attack-special:14", value: 14, label: "Chemical Damage" },
  { key: "attack-special:15", value: 15, label: "Mental Damage" },
  { key: "attack-special:16", value: 16, label: "Cause Disease" },
  { key: "attack-special:17", value: 17, label: "Cause Age" },
  { key: "attack-special:18", value: 18, label: "Cause Blindness" },
  { key: "attack-special:19", value: 19, label: "Turn to Stone" }
];

export const RANDOM_WEAPON_OPTIONS: CombatSelectOption[] = [
  { key: "random-weapon:-1", value: -1, label: "-1 Random swords" },
  { key: "random-weapon:-2", value: -2, label: "-2 Random clubs" },
  { key: "random-weapon:-3", value: -3, label: "-3 Random clubs / spears" },
  { key: "random-weapon:-4", value: -4, label: "-4 Random axes" },
  { key: "random-weapon:-5", value: -5, label: "-5 Random small swords / small axes" },
  { key: "random-weapon:-6", value: -6, label: "-6 Random clubs / flails / spears" },
  { key: "random-weapon:-7", value: -7, label: "-7 Random spears / pole weapons" },
  { key: "random-weapon:-8", value: -8, label: "-8 Random axes / spears" },
  { key: "random-weapon:-9", value: -9, label: "-9 Random swords / dagger / cutlass / nunchucka" }
];

export const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;

export function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

export function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

export function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
}
