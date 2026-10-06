import type { Action, ProjectCommand } from "../../types";
import { supportsRemakeProgressionMediaRequirement } from "../../realmzActions";

export type ActionPointStepDraft = { rawCode: number; id: number; mediaRequiredForProgression: boolean };
export type ActionPointStepDrafts = Record<string, ActionPointStepDraft>;

export function actionPointStepDraftKey(triggerId: string | null | undefined, slot: number) {
  return `${triggerId}:${slot}`;
}

export function actionPointSlotDraft(
  drafts: ActionPointStepDrafts,
  triggerId: string | null | undefined,
  slot: number,
  action?: Action
) {
  return drafts[actionPointStepDraftKey(triggerId, slot)] ?? {
    rawCode: action?.rawCode ?? 0,
    id: action?.id ?? 0,
    mediaRequiredForProgression: Boolean(action?.mediaRequiredForProgression)
  };
}

export function actionPointStepDraftDirty(draft: ActionPointStepDraft, action?: Action) {
  return action
    ? draft.rawCode !== action.rawCode ||
      draft.id !== action.id ||
      draft.mediaRequiredForProgression !== Boolean(action.mediaRequiredForProgression)
    : draft.rawCode !== 0 || draft.id !== 0 || draft.mediaRequiredForProgression;
}

export function swapActionPointStepDrafts(drafts: ActionPointStepDrafts, triggerId: string, fromSlot: number, toSlot: number) {
  const next = { ...drafts };
  const fromKey = actionPointStepDraftKey(triggerId, fromSlot);
  const toKey = actionPointStepDraftKey(triggerId, toSlot);
  const fromDraft = next[fromKey];
  const toDraft = next[toKey];
  if (fromDraft) next[toKey] = fromDraft;
  else delete next[toKey];
  if (toDraft) next[fromKey] = toDraft;
  else delete next[fromKey];
  return next;
}

export function removeActionPointStepDraft(drafts: ActionPointStepDrafts, key: string) {
  if (!(key in drafts)) return drafts;
  const next = { ...drafts };
  delete next[key];
  return next;
}

export function removeActionPointEdcdDrafts<T>(drafts: Record<string, T>, prefix: string) {
  if (!prefix || !Object.keys(drafts).some((key) => key.startsWith(prefix))) return drafts;
  const next = { ...drafts };
  for (const key of Object.keys(next)) {
    if (key.startsWith(prefix)) delete next[key];
  }
  return next;
}

export function actionPointStepApplyCommand({
  triggerId,
  slot,
  draft,
  edcdShape,
  edcdValues,
  secondaryEdcdValues
}: {
  triggerId: string;
  slot: number;
  draft: ActionPointStepDraft;
  edcdShape?: string;
  edcdValues?: [number, number, number, number, number];
  secondaryEdcdValues?: [number, number, number, number, number];
}): ProjectCommand {
  if (edcdShape) {
    return {
      kind: "applyRealmzScriptStep",
      label: `Update slot ${slot}`,
      triggerId,
      slot,
      opcode: draft.rawCode,
      id: draft.id,
      edcdValues: edcdValues ?? [0, 0, 0, 0, 0],
      secondaryEdcdValues
    };
  }
  return {
    kind: "updateActionSlot",
    label: `Update slot ${slot}`,
    triggerId,
    slot,
    rawCode: draft.rawCode,
    id: draft.id,
    mediaRequiredForProgression:
      supportsRemakeProgressionMediaRequirement(draft.rawCode) && draft.mediaRequiredForProgression
  };
}
