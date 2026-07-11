import {
  Issue,
  LevelType,
  Project,
  SelectedEntity,
  SemanticEntity,
  SemanticLink,
  SemanticRecord,
  TriggerRecord
} from "./types";
import { directSemanticLinksFor, labelForSelectedId } from "./directRecordIndex";
import { semanticEntityById, semanticIndex, semanticLinksForId, semanticRecordById } from "./semanticIndex";

export function hasDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function commandError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export function mapEntityId(levelType: LevelType, index: number) {
  return `map:${levelType}:${index}`;
}

export function triggerEntityId(levelType: LevelType | null, levelIndex: number | null, recordIndex: number, source: string) {
  if (source === "Data ED3") return `macro:${recordIndex}`;
  return `trigger:${levelType ?? "unknown"}:${levelIndex ?? 0}:${recordIndex}`;
}

export function actionSlotEntityId(trigger: Pick<TriggerRecord, "levelType" | "levelIndex" | "recordIndex" | "source">, slot: number) {
  return `action-slot:${triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)}:${slot}`;
}

export function selectedEntityForSemantic(entity: SemanticEntity): SelectedEntity {
  if (entity.type === "scenario") return { type: "record", id: entity.id };
  if (entity.type === "trigger") return { type: "trigger", id: entity.id };
  if (entity.type === "macro") return { type: "macro", id: entity.id };
  if (entity.type === "map") return { type: "map", id: entity.id };
  if (
    entity.type === "resource" ||
    entity.type === "resource type" ||
    entity.type === "picture" ||
    entity.type === "icon-resource" ||
    entity.type === "sound" ||
    entity.type === "text-resource" ||
    entity.type === "style-resource" ||
    entity.type === "string-list-resource" ||
    entity.type === "realmz-metadata-resource" ||
    entity.type === "version-resource" ||
    entity.type === "tile atlas" ||
    entity.type === "asset-fallback" ||
    entity.type === "render-profile" ||
    entity.type === "runtime-cache"
  ) {
    return { type: "resource", id: entity.id };
  }
  if (entity.type.includes("encounter")) return { type: "encounter", id: entity.id };
  if (entity.type === "battle") return { type: "battle", id: entity.id };
  if (entity.type === "monster") return { type: "monster", id: entity.id };
  if (entity.type === "message") return { type: "message", id: entity.id };
  if (entity.type === "shop") return { type: "shop", id: entity.id };
  if (entity.type === "item-reference" || entity.type === "spell-reference") return { type: "record", id: entity.id };
  if (entity.type === "quest flag") return { type: "questFlag", id: entity.id };
  return { type: "record", id: entity.id };
}

export function selectEntityFromId(id: string): SelectedEntity {
  if (id.startsWith("map:")) return { type: "map", id };
  if (id.startsWith("scenario:")) return { type: "record", id };
  if (id.startsWith("trigger:")) return { type: "trigger", id };
  if (id.startsWith("macro:")) return { type: "macro", id };
  if (id.startsWith("action-slot:")) return { type: "record", id };
  if (id.startsWith("random:")) return { type: "encounter", id };
  if (
    id.startsWith("resource:") ||
    id.startsWith("resource-type:") ||
    id.startsWith("picture:") ||
    id.startsWith("sound:") ||
    id.startsWith("asset:") ||
    id.startsWith("render-profile:") ||
    id.startsWith("asset-fallback:") ||
    id.startsWith("runtime-cache:")
  ) {
    return { type: "resource", id };
  }
  if (id.startsWith("encounter:")) return { type: "encounter", id };
  if (id.startsWith("battle:")) return { type: "battle", id };
  if (id.startsWith("monster:")) return { type: "monster", id };
  if (id.startsWith("message:")) return { type: "message", id };
  if (id.startsWith("option-label:")) return { type: "record", id };
  if (id.startsWith("shop:")) return { type: "shop", id };
  if (id.startsWith("treasure:") || id.startsWith("thief:") || id.startsWith("time:") || id.startsWith("contact:") || id.startsWith("solids:") || id.startsWith("menu:") || id.startsWith("item:") || id.startsWith("spell:")) {
    return { type: "record", id };
  }
  if (id.startsWith("quest-flag:")) return { type: "questFlag", id };
  return { type: "record", id };
}

export function findSemanticEntity(project: Project | null, selected: SelectedEntity | null) {
  if (!project || !selected) return null;
  return semanticEntityById(project, selected.id);
}

export function findSemanticRecord(project: Project | null, id: string | null): SemanticRecord | null {
  return semanticRecordById(project, id);
}

export function linksFor(project: Project | null, id: string | null) {
  const directLinks = directSemanticLinksFor(project, id);
  const semanticLinks = semanticLinksForId(project, id);
  if (directLinks.length === 0) return semanticLinks;
  const seen = new Set(directLinks.map((link) => `${link.from}->${link.to}:${link.kind}`));
  return {
    outgoing: semanticLinks.outgoing,
    incoming: [
      ...directLinks,
      ...semanticLinks.incoming.filter((link) => {
      const key = `${link.from}->${link.to}:${link.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    ]
  };
}

export function semanticLabel(project: Project | null, id: string) {
  if (!project) return id;
  const directLabel = labelForSelectedId(project, null, id);
  if (directLabel && directLabel !== id) return directLabel;
  const index = semanticIndex(project);
  return (
    index.entitiesById.get(id)?.label ??
    index.recordsById.get(id)?.label ??
    id
  );
}

export function issuesFor(project: Project | null): Issue[] {
  if (!project) return [];
  return [
    ...project.validation.errors.map((message) => ({
      severity: "error",
      message,
      source: "Authoring Blockers",
      target: targetFromValidationMessage(message),
      provenance: "authored" as const
    })),
    ...project.validation.warnings
      .map(issueFromValidationWarning)
      .filter((issue): issue is Issue => Boolean(issue)),
    ...project.semanticSchema.diagnostics
      .map(issueFromSemanticDiagnostic)
      .filter((issue): issue is Issue => Boolean(issue)),
    ...project.diagnostics
      .map(issueFromSourceDiagnostic)
      .filter((issue): issue is Issue => Boolean(issue))
  ];
}

function issueFromValidationWarning(message: string): Issue | null {
  if (isSupportingValidationWarning(message)) return null;
  return {
    severity: "warning",
    message,
    source: validationWarningSource(message),
    target: targetFromValidationMessage(message),
    provenance: validationWarningProvenance(message)
  };
}

function issueFromSourceDiagnostic(diagnostic: Project["diagnostics"][number]): Issue | null {
  if (diagnostic.severity === "info") return null;
  if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") return null;
  if (diagnostic.severity === "warning" && SUPPORTING_SOURCE_DIAGNOSTIC_CODES.has(diagnostic.code)) return null;
  return {
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: diagnosticSourceGroup(diagnostic.code, diagnostic.source),
    target: targetFromDiagnostic(diagnostic.message),
    provenance: diagnostic.code.includes("runtime") ? "runtime" : "imported"
  };
}

function issueFromSemanticDiagnostic(diagnostic: Project["semanticSchema"]["diagnostics"][number]): Issue | null {
  if (diagnostic.severity === "info") return null;
  if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") return null;
  const target = targetFromSemanticDiagnostic(diagnostic);
  const location = target ? scenarioLocationLabel(target) : null;
  return {
    severity: diagnostic.severity,
    message: location ? `${location}: ${diagnostic.message}` : `Semantic ${diagnostic.type}: ${diagnostic.message}`,
    source: semanticDiagnosticSourceGroup(diagnostic),
    target,
    detail: semanticDiagnosticDetail(diagnostic),
    provenance: diagnostic.confidence === "source-backed" ? "imported" : "reference"
  };
}

const SUPPORTING_SOURCE_DIAGNOSTIC_CODES = new Set([
  "trailing-bytes",
  "unsupported-scenario-picture-preview",
  "unsupported-scenario-icon-preview",
  "unsupported-scenario-sound-preview"
]);

const SUPPORTING_VALIDATION_WARNING_PATTERNS = [
  / has \d+(?:,\d+)* trailing bytes after full records\.$/,
  /\d+(?:,\d+)* managed media asset\(s\) are present; desktop export writes them to the Scenario resource fork\.$/,
  /^Semantic graph has \d+(?:,\d+)* unresolved link endpoint\(s\);/,
  /\d+(?:,\d+)* referenced resource\(s\) are not scenario-supplied and will use shared\/fallback provenance when available\.$/,
  /\d+(?:,\d+)* render asset fallback\(s\) are present; maps using them may render as decoded colors\.$/,
  /\d+(?:,\d+)* generated runtime cache model\(s\) are read-only and will not be authored on export\.$/,
  /\d+(?:,\d+)* unsupported source file\(s\) will pass through unchanged:/,
  /\d+(?:,\d+)* preserved source file\(s\) will pass through unchanged because Providence does not author those file families directly:/,
  /^Semantic (missing-edcd-row|missing-secondary-edcd-row):/,
  /^.+ looks like a generated runtime cache and is treated as evidence, not authored data\.$/,
  /^.+ atlas is not available in browser import; decoded colors are used\.$/,
  /^Data Solids is missing; special negative tile solidity will remain unknown\.$/,
  /^Landlook -?\d+ has no decoded mapstats; tile attributes will be shown as unknown metadata\.$/,
  /\d+(?:,\d+)* Realmz special tile value\(s\) do not currently resolve to decoded cicn icon art\.$/,
  /\d+(?:,\d+)* positive high map field value\(s\) carry Realmz state bands;/
];

function isSupportingValidationWarning(message: string) {
  return SUPPORTING_VALIDATION_WARNING_PATTERNS.some((pattern) => pattern.test(message));
}

function validationWarningSource(message: string) {
  if (/^(Simple Encounter|Complex Encounter|Rogue Encounter|Timed Encounter)/.test(message)) return "Encounter Warnings";
  if (/^(Battle|Monster|Treasure|Shop) /.test(message)) return "Record Warnings";
  if (/^Map record /.test(message)) return "Map Warnings";
  if (/asset|PICT|cicn|snd|TEXT|styl|resource/i.test(message)) return "Scenario Asset Warnings";
  if (/String|Option label|text|ASCII/i.test(message)) return "Text Warnings";
  if (/Battle|Monster|Treasure|Shop/i.test(message)) return "Record Warnings";
  if (/Encounter|Action|Settings|macro|target/i.test(message)) return "Script Warnings";
  if (/Map record|map|Landlook|tile/i.test(message)) return "Map Warnings";
  if (/Custom spell|Race override|Caste override|attribute pair/i.test(message)) return "Rules Warnings";
  if (/Semantic schema version/i.test(message)) return "Import Refresh Warnings";
  return "Authoring Warnings";
}

function validationWarningProvenance(message: string): Issue["provenance"] {
  if (/preserv|import|source-backed|re-import/i.test(message)) return "imported";
  if (/runtime|cache/i.test(message)) return "runtime";
  if (/export|write|writer/i.test(message)) return "export";
  return "authored";
}

function diagnosticSourceGroup(code: string, source: string | null) {
  if (code.includes("tile-atlas")) return "Scenario Asset Warnings";
  if (code.includes("monster-icon")) return "Scenario Asset Warnings";
  if (code.includes("preview")) return "Preview Diagnostics";
  return source ?? code;
}

function semanticDiagnosticSourceGroup(diagnostic: Project["semanticSchema"]["diagnostics"][number]) {
  if (diagnostic.type.includes("edcd")) return "Script Warnings";
  return diagnostic.source ?? `Semantic ${diagnostic.type}`;
}

function targetFromValidationMessage(message: string) {
  return (
    targetFromMatch(message, /^String (-?\d+)\b/, "message") ??
    targetFromMatch(message, /^Option label (-?\d+)\b/, "option-label") ??
    targetFromMatch(message, /^Battle (-?\d+)\b/, "battle") ??
    targetFromMatch(message, /^Monster description (-?\d+)\b/, "monster") ??
    targetFromMatch(message, /^Monster (-?\d+)\b/, "monster") ??
    targetFromMatch(message, /^Treasure (-?\d+)\b/, "treasure") ??
    targetFromMatch(message, /^Shop (-?\d+)\b/, "shop") ??
    targetFromMatch(message, /^Simple Encounter (-?\d+):/, "encounter:simple") ??
    targetFromMatch(message, /^Complex Encounter (-?\d+):/, "encounter:complex") ??
    targetFromMatch(message, /^Rogue Encounter (-?\d+):/, "thief") ??
    targetFromMatch(message, /^Timed Encounter (-?\d+):/, "time") ??
    targetFromMatch(message, /^Map record (-?\d+)\b/, "map-record") ??
    targetFromMatch(message, /^Custom spell (-?\d+)\b/, "spell") ??
    targetFromMatch(message, /^Race override (-?\d+)\b/, "race") ??
    targetFromMatch(message, /^Caste override (-?\d+)\b/, "caste") ??
    null
  );
}

function targetFromSemanticDiagnostic(diagnostic: Project["semanticSchema"]["diagnostics"][number]) {
  const actionSlot = diagnostic.data.actionSlot;
  if (typeof actionSlot === "string" && actionSlot.startsWith("action-slot:")) return actionSlot;
  return null;
}

function semanticDiagnosticDetail(diagnostic: Project["semanticSchema"]["diagnostics"][number]) {
  if (diagnostic.type === "missing-edcd-row") {
    const rowId = diagnostic.data.rowId;
    return `Open this step, choose its values, and apply it to create Action Settings ${rowId}; or change the step to a valid Settings row.`;
  }
  if (diagnostic.type === "missing-secondary-edcd-row") {
    const rowId = diagnostic.data.secondaryRowId;
    return `Open this step, choose its secondary shape values, and apply it to create Action Settings ${rowId}; or repair the action shape.`;
  }
  return diagnostic.confidence ? `Confidence: ${diagnostic.confidence}.` : undefined;
}

function targetFromDiagnostic(message: string) {
  return (
    targetFromMatch(message, /^Scenario PICT (-?\d+)\b/, "resource:PICT") ??
    targetFromMatch(message, /^Scenario cicn (-?\d+)\b/, "resource:cicn") ??
    targetFromMatch(message, /^Scenario snd (-?\d+)\b/, "resource:snd ") ??
    targetFromMatch(message, /^Landlook -?\d+ expects scenario PICT (-?\d+)\b/, "resource:PICT") ??
    null
  );
}

function targetFromMatch(message: string, pattern: RegExp, prefix: string) {
  const match = message.match(pattern);
  return match ? `${prefix}:${match[1]}` : null;
}

function scenarioLocationLabel(target: string) {
  const triggerSlot = target.match(/^action-slot:trigger:(land|dungeon):(-?\d+):(-?\d+):(-?\d+)$/);
  if (triggerSlot) {
    const [, levelType, levelIndex, recordIndex, slot] = triggerSlot;
    return `Action Point ${recordIndex} on ${levelType} ${levelIndex}, step ${Number(slot) + 1}`;
  }
  const macroSlot = target.match(/^action-slot:macro:(-?\d+):(-?\d+)$/);
  if (macroSlot) {
    const [, recordIndex, slot] = macroSlot;
    return `Extra Action Point ${recordIndex}, step ${Number(slot) + 1}`;
  }
  if (target.startsWith("encounter:simple:")) return `Simple Encounter ${target.slice("encounter:simple:".length)}`;
  if (target.startsWith("encounter:complex:")) return `Complex Encounter ${target.slice("encounter:complex:".length)}`;
  if (target.startsWith("thief:")) return `Rogue Encounter ${target.slice("thief:".length)}`;
  if (target.startsWith("time:")) return `Timed Encounter ${target.slice("time:".length)}`;
  return target;
}

export function compactValue(value: unknown) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length > 10 ? `${value.slice(0, 10).join(", ")}...` : value.join(", ");
  return JSON.stringify(value);
}
