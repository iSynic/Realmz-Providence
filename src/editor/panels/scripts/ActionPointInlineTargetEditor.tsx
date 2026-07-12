import type { ReactNode } from "react";
import {
  TargetPicker,
  resolveSignedMessageTarget,
  signedTargetValueForSelection,
  targetPickerConfig
} from "../../components/RealmzTargetPicker";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { InlineMessageTargetEditor } from "./InlineMessageTargetEditor";
import { nextAuthorableTargetId } from "./ReferenceIdField";

export function ActionPointInlineTargetEditor({
  project,
  catalog,
  rawCode,
  id,
  enabled,
  desktopRuntime,
  projectDir,
  workspaceDir,
  targetRecordPanel,
  onSetSelectedDraft,
  onPreviewEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  rawCode: number;
  id: number;
  enabled: boolean;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  targetRecordPanel?: ReactNode;
  onSetSelectedDraft: (draft: { rawCode: number; id: number }) => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const pickerConfig = targetPickerConfig(rawCode);
  if (!enabled || !pickerConfig) return null;
  const inlineMessageTargetId = pickerConfig.recordType === "message" ? resolveSignedMessageTarget(rawCode, id) : 0;
  const hasInlineMessageEditor = inlineMessageTargetId > 0;

  return (
    <div className="realmz-current-step-target">
      <TargetPicker
        project={project}
        catalog={catalog}
        opcode={rawCode}
        value={id}
        showDetail={!hasInlineMessageEditor}
        previewContext={{ desktopRuntime, projectDir, workspaceDir }}
        onChange={(nextId) => onSetSelectedDraft({ rawCode, id: nextId })}
        onInspect={onPreviewEntity}
        onCreate={(recordType, requestedId) => {
          const targetId = requestedId ?? nextAuthorableTargetId(project, recordType);
          onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${recordType}`, recordType, id: targetId });
          onSetSelectedDraft({ rawCode, id: signedTargetValueForSelection(rawCode, id, targetId) });
        }}
      />
      {hasInlineMessageEditor && (
        <InlineMessageTargetEditor project={project} targetId={inlineMessageTargetId} onApplyCommand={onApplyCommand} />
      )}
      {!hasInlineMessageEditor && targetRecordPanel}
    </div>
  );
}
