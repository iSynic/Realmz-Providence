import { LevelType, TriggerRecord } from "./types";

export const ACTION_POINTS_PER_LEVEL = 100;

export type ActionPointCapacity = {
  total: number;
  active: number;
  reusable: number;
  max: number;
  canCreate: boolean;
};

export function actionPointCapacity(
  triggers: TriggerRecord[],
  levelType: LevelType,
  levelIndex: number,
  max = ACTION_POINTS_PER_LEVEL
): ActionPointCapacity {
  const records = triggers.filter((trigger) => trigger.levelType === levelType && trigger.levelIndex === levelIndex);
  const reusable = records.filter(isReusableDoorPlaceholder).length;
  const active = records.filter((trigger) => !isReusableDoorPlaceholder(trigger)).length;
  return {
    total: records.length,
    active,
    reusable,
    max,
    canCreate: records.length < max || reusable > 0
  };
}

export function isReusableDoorPlaceholder(trigger: TriggerRecord) {
  return !trigger.active && !trigger.coordinate && trigger.actions.length === 0;
}
