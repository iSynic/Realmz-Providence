import type { TriggerRecord } from "../../types";
import { actionSlotEntityId } from "../../utils";

export function includeSelectedTrigger(records: TriggerRecord[], selected: TriggerRecord | null, limit: number) {
  const cappedLimit = Math.max(0, limit);
  const visible = records.slice(0, cappedLimit);
  if (!selected || visible.some((record) => record.id === selected.id)) return visible;
  if (!records.some((record) => record.id === selected.id)) return visible;
  return [selected, ...visible];
}

export function actionSlotSelectionId(trigger: TriggerRecord, slot: number) {
  return actionSlotEntityId(trigger, slot);
}

export function actionSlotIndexFromSelection(entityId: string | null | undefined) {
  if (!entityId?.startsWith("action-slot:")) return null;
  const slot = Number(entityId.slice(entityId.lastIndexOf(":") + 1));
  return Number.isInteger(slot) ? slot : null;
}
