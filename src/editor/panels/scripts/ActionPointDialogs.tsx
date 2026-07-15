import { Eye, Trash2, X } from "lucide-react";
import type { MapCoordinateTarget, SelectedEntity } from "../../types";
import { FloatingWorkbenchPanel, ReferencePreview, type ReferencePreviewModel } from "../../ui";
import "./ActionPointDialogs.css";

export type ScriptPreviewTarget =
  | {
      kind: "entity";
      title: string;
      detail: string;
      entity: SelectedEntity;
    }
  | {
      kind: "map-coordinate";
      title: string;
      detail: string;
      target: MapCoordinateTarget;
    };

export function ScriptDestructiveActionDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="script-draft-navigation-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="script-draft-navigation-dialog script-destructive-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-destructive-action-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id="script-destructive-action-title">{title}</strong>
            <small>This action changes the script immediately.</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Cancel destructive action" onClick={onCancel}>
            <X size={12} />
          </button>
        </header>
        <p>{body}</p>
        <div className="script-draft-navigation-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger btn-xs" onClick={onConfirm}>
            <Trash2 size={12} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScriptPreviewPanel({
  preview,
  onClose,
  onOpen
}: {
  preview: ScriptPreviewTarget;
  onClose: () => void;
  onOpen: () => void;
}) {
  const openLabel = preview.kind === "entity" ? "Open Target" : "Open in Maps";
  return (
    <FloatingWorkbenchPanel
      title={preview.title}
      eyebrow={preview.kind === "entity" ? "Target Preview" : "Map Coordinate Preview"}
      storageKey="scripts.targetPreview.position"
      defaultWidth={480}
      defaultHeight={320}
      minWidth={360}
      minHeight={240}
      className="script-preview-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Close preview" title="Close" onClick={onClose}>
          <X size={12} />
        </button>
      )}
    >
      <div className="script-preview-panel-body">
        <ReferencePreview preview={scriptPreviewReferenceModel(preview)} />
        <div className="script-preview-panel-note">
          Preview does not leave this step editor. Use {openLabel} to navigate to the target.
        </div>
        <div className="script-preview-panel-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
            <Eye size={12} /> {openLabel}
          </button>
        </div>
      </div>
    </FloatingWorkbenchPanel>
  );
}

export function scriptPreviewReferenceModel(preview: ScriptPreviewTarget): ReferencePreviewModel {
  if (preview.kind === "entity") {
    return {
      key: `entity:${preview.entity.type}:${preview.entity.id}`,
      kind: "summary",
      title: preview.title,
      detail: preview.detail,
      summary: `Reference ${preview.entity.id}`
    };
  }
  return {
    key: `map:${preview.target.levelType}:${preview.target.levelIndex}:${preview.target.x}:${preview.target.y}`,
    kind: "summary",
    title: preview.title,
    detail: preview.detail,
    summary: `${preview.target.levelType === "dungeon" ? "Dungeon" : "Land"} level ${preview.target.levelIndex} at ${preview.target.x}, ${preview.target.y}`
  };
}
