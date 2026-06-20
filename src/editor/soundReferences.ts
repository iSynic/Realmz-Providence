const DIVINITY_COMPATIBLE_SOUND_IDS = [
  1, 5, 6, 7, 8, 9, 20, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 128, 129, 130, 132, 133, 134, 137,
  138, 139, 141, 143, 144, 145, 147, 148, 600, 601, 602, 603, 604, 605, 606, 607, 609, 610, 611,
  612, 613, 615, 618, 619, 620, 621, 622, 624, 625, 626, 629, 630, 631, 632, 633, 634, 635, 636,
  637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 649, 650, 651, 652, 653, 654, 655, 658,
  659, 661, 662, 663, 664, 665, 666, 667, 670, 674, 675, 677, 678, 681, 683, 684, 686, 690, 691,
  692, 693, 694, 695, 698, 699, 700, 701, 702, 703, 704, 705, 1100, 1101, 1103, 3000, 3001, 3002,
  3003, 5000, 6000, 6001, 6002, 10001, 10002, 10004, 10049, 10051, 10090, 10105, 10107, 10121,
  10122, 10123, 10129, 10136, 10141, 20001, 20002, 20003, 20004, 20005, 26260, 30000, 30001,
  30002, 30003, 30005
] as const;

const DIVINITY_COMPATIBLE_SOUND_ID_SET = new Set<number>(DIVINITY_COMPATIBLE_SOUND_IDS);

export function divinityCompatibleSoundIds() {
  return DIVINITY_COMPATIBLE_SOUND_IDS;
}

export function isDivinityCompatibleSoundId(id: number) {
  return Number.isFinite(id) && DIVINITY_COMPATIBLE_SOUND_ID_SET.has(Math.abs(id));
}

export function divinitySoundReferenceLabel(id: number) {
  return `Sound ${Math.abs(id)}`;
}
