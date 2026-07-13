import { Eye, Trash2, X } from "lucide-react";
import type { MapCoordinateTarget, SelectedEntity } from "../../types";

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

export function ScriptPreviewDialog({
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
    <div className="script-draft-navigation-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="script-draft-navigation-dialog script-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-preview-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id="script-preview-dialog-title">{preview.title}</strong>
            <small>{preview.kind === "entity" ? "Target preview" : "Map coordinate preview"}</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Close preview" onClick={onClose}>
            <X size={12} />
          </button>
        </header>
        <p>{preview.detail}</p>
        <div className="script-preview-dialog-note">
          Preview does not leave this step editor. Use {openLabel} to navigate to the target.
        </div>
        <div className="script-draft-navigation-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
            <Eye size={12} /> {openLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
