export type SpellAnimationZeroMode = "blank-cast" | "default-resolution";

export function spellSoundResourceId(value: number) {
  return value > 0 ? 600 + value : null;
}

export function spellAnimationFrameIds(value: number, zeroMode: SpellAnimationZeroMode) {
  if (value <= 0 && zeroMode === "blank-cast") return [];
  const base = value <= 0 ? 12032 : 11992 + value * 8;
  return Array.from({ length: 8 }, (_, index) => base + index);
}

export function spellAnimationHint(value: number, zeroMode: SpellAnimationZeroMode) {
  if (value <= 0 && zeroMode === "blank-cast") return "Blank cast square";
  const frames = spellAnimationFrameIds(value, zeroMode);
  return `Animation frames ${frames[0]}-${frames[frames.length - 1]}`;
}

export function spellAnimationIsBlank(value: number, zeroMode: SpellAnimationZeroMode) {
  return value <= 0 && zeroMode === "blank-cast";
}

export function fastplotTileId(value: number) {
  return value > 0 ? 200 + value : null;
}

export function racePortraitSetFirstIconId(defaultIconSet: number) {
  return 251 + defaultIconSet * 6;
}
