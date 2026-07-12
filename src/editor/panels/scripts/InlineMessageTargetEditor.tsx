import type { Project, ProjectCommand } from "../../types";

export function InlineMessageTargetEditor({
  project,
  targetId,
  onApplyCommand
}: {
  project: Project;
  targetId: number;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  if (!Number.isInteger(targetId) || targetId <= 0) return null;
  const record = project.messages?.find((candidate) => candidate.id === targetId);
  return (
    <div className="inline-message-target-editor">
      {record ? (
        <label className="script-target-wide-field">
          <span>Text</span>
          <textarea
            key={`inline-message:${targetId}`}
            defaultValue={record.text}
            maxLength={255}
            onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update string", id: targetId, changes: { text: event.currentTarget.value } })}
          />
          <small>{record.text.length}/255 bytes before Classic encoding</small>
        </label>
      ) : (
        <div className="inline-message-target-missing">
          <small>This step points at string {targetId}, but that string does not exist yet.</small>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create string", recordType: "message", id: targetId })}
          >
            Create String
          </button>
        </div>
      )}
    </div>
  );
}
