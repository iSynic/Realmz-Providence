import type { ScriptTargetOption } from "../../components/RealmzTargetPicker";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export function ActionPointTargetPreview({
  option,
  definition,
  behavior,
  canExpand,
  expanded,
  onToggleExpanded
}: {
  option: ScriptTargetOption;
  definition: ScriptActionDefinition;
  behavior?: string | null;
  canExpand: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <>
      <div className="realmz-selected-target-preview">
        <span>{definition.target?.label ?? "Target"}</span>
        <strong>{option.label}</strong>
        <p>{option.detail}</p>
        {option.summary && <small>{option.summary}</small>}
        {behavior && <small>{behavior}</small>}
      </div>
      {canExpand && (
        <button type="button" className="btn btn-secondary btn-xs realmz-preview-toggle" onClick={onToggleExpanded}>
          {expanded ? "Collapse Preview" : "Show Full Preview"}
        </button>
      )}
    </>
  );
}
