import { normalizeStepOpcode } from "../../realmzActions";
import contextSource from "./scriptActionContexts.json";

export type ScriptActionAuthoringContext =
  | "action-point"
  | "simple-encounter"
  | "complex-encounter"
  | "battle-macro"
  | "monster-macro";

type ContextRestriction = {
  contexts: readonly ScriptActionAuthoringContext[];
  reason: string;
};

const CONTEXT_RESTRICTIONS: Readonly<Record<number, ContextRestriction>> = Object.fromEntries(
  contextSource.restrictions.map((restriction) => [
    restriction.opcode,
    {
      contexts: restriction.contexts as ScriptActionAuthoringContext[],
      reason: restriction.reason
    }
  ])
);

export function scriptActionContextRestriction(rawCode: number): ContextRestriction | null {
  return CONTEXT_RESTRICTIONS[normalizeStepOpcode(rawCode)] ?? null;
}

export function scriptActionAllowedInContext(rawCode: number, context: ScriptActionAuthoringContext) {
  const restriction = scriptActionContextRestriction(rawCode);
  return !restriction || restriction.contexts.includes(context);
}

export function scriptActionAllowedInAnyContext(
  rawCode: number,
  contexts: readonly ScriptActionAuthoringContext[]
) {
  const restriction = scriptActionContextRestriction(rawCode);
  return !restriction || contexts.some((context) => restriction.contexts.includes(context));
}

export function scriptActionContextRestrictionReason(rawCode: number) {
  return scriptActionContextRestriction(rawCode)?.reason ?? null;
}

export function restrictedScriptActionOpcodes() {
  return Object.keys(CONTEXT_RESTRICTIONS).map(Number).sort((left, right) => left - right);
}
