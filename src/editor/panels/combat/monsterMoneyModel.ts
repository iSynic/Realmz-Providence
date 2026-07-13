export const MONSTER_MONEY_REWARDS = [
  { label: "Gold", iconId: 2002 },
  { label: "Gems", iconId: 2014 },
  { label: "Jewelry", iconId: 2012 }
];

export const MONSTER_MONEY_LABELS = MONSTER_MONEY_REWARDS.map((reward) => reward.label);

export const MONSTER_MONEY_HELP = "Monster reward caps. Realmz rolls 0..value for gold, gems, and jewelry when a reward-eligible monster is killed.";
