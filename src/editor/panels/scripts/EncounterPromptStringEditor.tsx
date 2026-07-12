import { useEffect, useState } from "react";
import type { Project, ProjectCommand, SelectedEntity } from "../../types";
import { FloatingWorkbenchPanel } from "../../ui";
import { selectEntityFromId } from "../../utils";

export function EncounterPromptStringEditor({
  id,
  record,
  onClose,
  onSelectEntity,
  onApplyCommand
}: {
  id: number;
  record: Project["messages"][number] | null;
  onClose: () => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [draft, setDraft] = useState(record?.text ?? "");
  const exists = Boolean(record);

  useEffect(() => {
    setDraft(record?.text ?? "");
  }, [id, record?.text]);

  const goToStringEditor = () => {
    onSelectEntity?.(selectEntityFromId(`message:${id}`));
    onClose();
  };

  return (
    <FloatingWorkbenchPanel
      title={`Prompt String ${id}`}
      eyebrow="Encounter"
      storageKey="encounters.promptStringEditor.position"
      defaultWidth={560}
      defaultHeight={360}
      minWidth={420}
      minHeight={280}
      className="encounter-prompt-string-floating-editor"
      actions={(
        <>
          <button type="button" className="btn btn-secondary btn-xs" onClick={goToStringEditor}>
            Go to String Editor
          </button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
            Close
          </button>
        </>
      )}
    >
      <div className="encounter-prompt-string-editor-body">
        {!exists && (
          <div className="field-warning encounter-prompt-string-missing">
            <span>String {id} does not exist yet.</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: `Create String ${id}`, recordType: "message", id })}
            >
              Create String {id}
            </button>
          </div>
        )}
        <textarea
          value={draft}
          disabled={!exists}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder={exists ? "Prompt string text..." : "Create this string before editing."}
        />
        <footer className="encounter-prompt-string-editor-footer">
          <small>{draft.length}/255 bytes before Classic encoding</small>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!exists || draft === (record?.text ?? "")}
            onClick={() => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update String ${id}`, id, changes: { text: draft } })}
          >
            Save String
          </button>
        </footer>
      </div>
    </FloatingWorkbenchPanel>
  );
}
