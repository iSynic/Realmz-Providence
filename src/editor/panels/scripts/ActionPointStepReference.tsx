import type { DivinityOpcodeHelpEntry } from "../../divinityOpcodeHelp";
import type { EdcdRowUsage } from "../../edcdRows";
import { CollapsibleSection, FieldRow } from "../../ui";
import type { ScriptActionDefinition } from "./scriptActionCatalog";
import {
  actionAuthoringStateDetail,
  actionAuthoringStateLabel,
  actionStorageLabel,
  type CombatMacroContext
} from "./actionPointPresentation";

export function ActionPointStepReference({
  definition,
  combatMacroContext,
  rawCode,
  id,
  settingLabels,
  edcdRowId,
  rowUsage,
  divinityHelp
}: {
  definition: ScriptActionDefinition;
  combatMacroContext?: CombatMacroContext | null;
  rawCode: number;
  id: number;
  settingLabels: string[];
  edcdRowId: number | null;
  rowUsage?: EdcdRowUsage | null;
  divinityHelp?: DivinityOpcodeHelpEntry | null;
}) {
  return (
    <CollapsibleSection title="Step Reference" eyebrow="technical details" density="compact" storageKey="scripts.stepReference.open" defaultOpen={false}>
      <div className="realmz-raw-preview">
        <FieldRow label="Opcode" value={definition.label} />
        <FieldRow label="Authoring State" value={`${actionAuthoringStateLabel(definition, combatMacroContext)} - ${actionAuthoringStateDetail(definition, combatMacroContext)}`} />
        <FieldRow label="Storage" value={actionStorageLabel(definition)} />
        <FieldRow label="Export Behavior" value="Unchanged values are preserved on export. Edits update the same classic Realmz fields Providence already imports." />
        <FieldRow label="Original CODE / ID" value={`${rawCode} / ${id}`} />
        <FieldRow label="Target Meaning" value={definition.target?.help || definition.description || "No direct target required."} />
        {settingLabels.length > 0 && <FieldRow label="Settings Fields" value={settingLabels.join("; ")} />}
        {edcdRowId != null && <FieldRow label="Action Settings Row" value={edcdRowId} />}
        {rowUsage?.summary && <FieldRow label="Action Settings Summary" value={rowUsage.summary} />}
        {divinityHelp?.use && <FieldRow label="Divinity Use" value={divinityHelp.use} />}
        {divinityHelp?.options && divinityHelp.options.toLowerCase() !== "none" && <FieldRow label="Divinity Options" value={divinityHelp.options} />}
        {divinityHelp?.extraCodes && divinityHelp.extraCodes.toLowerCase() !== "none" && <FieldRow label="Divinity E-Codes" value={divinityHelp.extraCodes} />}
      </div>
    </CollapsibleSection>
  );
}
