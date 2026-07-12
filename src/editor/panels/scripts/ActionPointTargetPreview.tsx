import { Volume2 } from "lucide-react";
import type { ScriptTargetOption } from "../../components/RealmzTargetPicker";
import { playPreviewUrl } from "../../previewUrls";
import { normalizeStepOpcode } from "../../realmzActions";
import type { SelectedEntity } from "../../types";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export function ActionPointTargetPreview({
  option,
  previewUrl,
  definition,
  rawCode,
  behavior,
  canExpand,
  expanded,
  onToggleExpanded,
  onPreviewEntity
}: {
  option: ScriptTargetOption;
  previewUrl: string | null;
  definition: ScriptActionDefinition;
  rawCode: number;
  behavior?: string | null;
  canExpand: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
}) {
  const code = normalizeStepOpcode(rawCode);
  return (
    <>
      <div className="realmz-selected-target-preview">
        <span>{definition.target?.label ?? "Target"}</span>
        <strong>{option.label}</strong>
        <p>{option.detail}</p>
        {option.summary && <small>{option.summary}</small>}
        {behavior && <small>{behavior}</small>}
        {code === 27 && previewUrl && (
          <button
            type="button"
            className="realmz-picture-preview-button"
            title="Picture preview"
            onClick={() => option.entity && onPreviewEntity(option.entity)}
          >
            <img src={previewUrl} alt={option.label} />
          </button>
        )}
        {code === 27 && !previewUrl && (
          <small className="realmz-preview-unavailable">Picture preview loading or unavailable for this PICT variant.</small>
        )}
        {code === 9 && (
          <button
            type="button"
            className="btn btn-secondary btn-xs realmz-sound-preview-button"
            disabled={!previewUrl}
            title={previewUrl ? "Play this sound preview." : "No playable preview is available for this sound."}
            onClick={() => previewUrl && playPreviewUrl(previewUrl)}
          >
            <Volume2 size={12} /> Play
          </button>
        )}
      </div>
      {canExpand && (
        <button type="button" className="btn btn-secondary btn-xs realmz-preview-toggle" onClick={onToggleExpanded}>
          {expanded ? "Collapse Preview" : "Show Full Preview"}
        </button>
      )}
    </>
  );
}
