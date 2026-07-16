import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  TargetPicker,
  resolveSignedMessageTarget,
  signedTargetValueForSelection,
  targetOptionForOpcodeValue,
  targetPickerConfig,
  type ScriptTargetOption
} from "../../components/RealmzTargetPicker";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import { actionOptionFor } from "../../realmzActions";
import { realmzScriptStepDescriptorFor } from "../../realmzScriptDescriptors";
import type { LibraryCatalog, Project, RealmzTargetRecordKind } from "../../types";
import { FloatingWorkbenchPanel, ReferencePreview, type ReferencePreviewModel } from "../../ui";
import { resultActionBaseCode } from "./encounterFlow";
import { nextAuthorableTargetId } from "./ReferenceIdField";

type StoredPreviewType = Exclude<RealmzTargetRecordKind, "message" | "questLabel">;

export type EncounterResultTargetPreviewValue = {
  slot: number;
  opcode: number;
  value: number;
};

export function EncounterResultTargetPreview({
  project,
  catalog,
  preview,
  previewContext,
  renderRecordPreview,
  onCreateTarget,
  onChange,
  onClose
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  preview: EncounterResultTargetPreviewValue;
  previewContext: PreviewRuntimeContext;
  renderRecordPreview: (targetType: StoredPreviewType, targetId: number) => ReactNode;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const opcode = resultActionBaseCode(preview.opcode);
  const targetId = resolveSignedMessageTarget(opcode, preview.value);
  const targetType = realmzScriptStepDescriptorFor(opcode).targetType;
  const option = targetOptionForOpcodeValue(project, opcode, preview.value, catalog);
  const action = actionOptionFor(opcode);
  const picker = targetPickerConfig(opcode);
  const title = option?.label ?? `${picker?.label ?? action.shortLabel} ${targetId}`;
  const targetTypeLabel = picker?.label ?? (targetType ? targetType.replace(/([a-z])([A-Z])/g, "$1 $2") : "Referenced resource");
  const detail = [option?.detail, option?.summary, option?.compatibility, option?.sourceState]
    .filter(Boolean)
    .join(" | ");
  return (
    <FloatingWorkbenchPanel
      title={title}
      eyebrow={`Result CODE ${opcode} | ID ${preview.value}`}
      storageKey="encounters.resultTargetPreview.position"
      defaultWidth={620}
      defaultHeight={480}
      minWidth={420}
      minHeight={300}
      className="encounter-result-target-preview-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Close target preview" title="Close" onClick={onClose}>
          <X size={12} />
        </button>
      )}
    >
      <div className="encounter-result-target-preview-body">
        <header>
          <div>
            <strong>{action.shortLabel}</strong>
            <small>Search, select, and preview the target without leaving this encounter.</small>
          </div>
          <span>{targetTypeLabel}</span>
        </header>
        {picker && (
          <div className="encounter-result-target-picker">
            <TargetPicker
              project={project}
              catalog={catalog}
              opcode={opcode}
              value={preview.value}
              onChange={onChange}
              onCreate={(recordType, requestedId) => {
                const createId = requestedId ?? nextAuthorableTargetId(project, recordType);
                onCreateTarget(recordType, createId);
                onChange(signedTargetValueForSelection(opcode, preview.value, createId));
              }}
              allowCreateAtZero
              showDetail={false}
              showTargetCount={false}
              showPreview={false}
              previewContext={previewContext}
            />
          </div>
        )}
        {detail && <p className="encounter-result-target-preview-detail">{detail}</p>}
        <EncounterResultTargetPreviewContent
          project={project}
          opcode={opcode}
          targetId={targetId}
          targetType={targetType}
          option={option}
          previewContext={previewContext}
          renderRecordPreview={renderRecordPreview}
        />
      </div>
    </FloatingWorkbenchPanel>
  );
}

function EncounterResultTargetPreviewContent({
  project,
  opcode,
  targetId,
  targetType,
  option,
  previewContext,
  renderRecordPreview
}: {
  project: Project;
  opcode: number;
  targetId: number;
  targetType?: RealmzTargetRecordKind;
  option: ScriptTargetOption | null;
  previewContext: PreviewRuntimeContext;
  renderRecordPreview: (targetType: StoredPreviewType, targetId: number) => ReactNode;
}) {
  if (targetType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === targetId);
    return <ReferencePreview preview={record ? {
      key: `message:${targetId}`,
      kind: "text",
      title: `String ${targetId}`,
      detail: option?.sourceState,
      text: record.text || "This string is empty."
    } : {
      key: `message:${targetId}`,
      kind: "missing",
      title: `String ${targetId} is missing`,
      body: "Create or select a stored string before relying on this result.",
      state: "missing"
    }} />;
  }
  if (targetType === "questLabel") {
    const record = project.questLabels?.find((candidate) => candidate.id === targetId);
    return <ReferencePreview preview={record ? {
      key: `quest:${targetId}`,
      kind: "text",
      title: record.label || `Quest ${targetId}`,
      detail: option?.sourceState,
      text: record.note || `Story flag ${targetId} has no author note.`
    } : {
      key: `quest:${targetId}`,
      kind: "missing",
      title: `Story Flag ${targetId} is unnamed`,
      body: "Name this story flag before relying on it in a result.",
      state: "missing"
    }} />;
  }
  if (isStoredPreviewType(targetType)) {
    const rendered = renderRecordPreview(targetType, targetId);
    const preview: ReferencePreviewModel = rendered == null
      ? missingStoredTarget(targetType, targetId)
      : {
          key: `${targetType}:${targetId}`,
          kind: "custom",
          title: option?.label ?? storedTargetTitle(targetType, targetId),
          detail: option?.detail,
          content: rendered
        };
    return <ReferencePreview preview={preview} />;
  }
  return (
    <EncounterResultResourcePreview
      project={project}
      opcode={opcode}
      targetId={targetId}
      option={option}
      previewContext={previewContext}
    />
  );
}

function EncounterResultResourcePreview({
  project,
  opcode,
  targetId,
  option,
  previewContext
}: {
  project: Project;
  opcode: number;
  targetId: number;
  option: ScriptTargetOption | null;
  previewContext: PreviewRuntimeContext;
}) {
  const resourceType = opcode === 9 ? "snd " : opcode === 27 ? "PICT" : null;
  const previewUrl = useResolvedPreviewUrl(
    option?.previewPath ?? option?.managedAsset?.previewPath ?? option?.libraryAsset?.previewPath ?? null,
    option?.managedAsset ?? null,
    option?.libraryAsset ?? null,
    { ...previewContext, project, resourceType, resourceId: Math.abs(targetId) }
  );
  const isAudio = opcode === 9 || option?.previewMimeType?.startsWith("audio/");
  const isImage = opcode === 27 || option?.previewMimeType?.startsWith("image/");
  if (!option) {
    return <ReferencePreview preview={{
      key: `unresolved:${opcode}:${targetId}`,
      kind: "missing",
      title: "No preview available",
      body: `Providence could not resolve ID ${targetId} to a stored target for this action.`,
      state: "missing"
    }} />;
  }
  const detail = [option.detail, option.summary, option.sourceState].filter(Boolean).join(" | ");
  const preview: ReferencePreviewModel = isImage ? {
    key: option.key,
    kind: "image",
    title: option.label,
    detail,
    src: previewUrl,
    alt: `Preview of ${option.label}`,
    state: previewUrl ? "resolved" : "unavailable"
  } : isAudio ? {
    key: option.key,
    kind: "audio",
    title: option.label,
    detail,
    src: previewUrl,
    onPlay: previewUrl ? () => playPreviewUrl(previewUrl) : undefined,
    state: previewUrl ? "resolved" : "unavailable"
  } : {
    key: option.key,
    kind: "summary",
    title: option.label,
    detail: option.sourceState,
    summary: option.summary || option.detail || "No additional preview details are available."
  };
  return <ReferencePreview preview={preview} />;
}

function isStoredPreviewType(targetType: RealmzTargetRecordKind | undefined): targetType is StoredPreviewType {
  return targetType === "battle"
    || targetType === "monster"
    || targetType === "treasure"
    || targetType === "shop"
    || targetType === "simpleEncounter"
    || targetType === "complexEncounter"
    || targetType === "thiefEncounter"
    || targetType === "timedEncounter";
}

function storedTargetTitle(targetType: StoredPreviewType, targetId: number) {
  return targetType === "battle" ? `Battle ${targetId}`
    : targetType === "monster" ? `Monster ${targetId}`
      : targetType === "treasure" ? `Treasure ${targetId}`
        : targetType === "shop" ? `Shop ${targetId}`
          : targetType === "simpleEncounter" ? `Simple Encounter ${targetId}`
            : targetType === "complexEncounter" ? `Complex Encounter ${targetId}`
              : targetType === "thiefEncounter" ? `Rogue Encounter ${targetId}`
                : `Time Encounter ${targetId}`;
}

function missingStoredTarget(targetType: StoredPreviewType, targetId: number): ReferencePreviewModel {
  const title = targetType === "battle" ? `Battle ${targetId} is missing`
    : targetType === "monster" ? `Monster ${targetId} is missing`
      : targetType === "treasure" ? `Treasure ${targetId} is missing`
        : targetType === "shop" ? `Shop ${targetId} is missing`
          : targetType === "simpleEncounter" ? `Simple Encounter ${targetId} is missing`
            : targetType === "complexEncounter" ? `Complex Encounter ${targetId} is missing`
              : targetType === "thiefEncounter" ? `Rogue Encounter ${targetId} is missing`
                : `Time Encounter ${targetId} is missing`;
  const body = targetType === "battle" || targetType === "monster" || targetType === "treasure" || targetType === "shop"
    ? "Choose an existing target or create this target."
    : "Choose an existing encounter or create this target.";
  return {
    key: `${targetType}:${targetId}`,
    kind: "missing",
    title,
    body,
    state: "missing"
  };
}
