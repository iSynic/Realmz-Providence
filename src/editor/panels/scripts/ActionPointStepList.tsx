import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { categoryColor } from "../../components/TileSprite";
import { actionOptionFor } from "../../realmzActions";
import type { Action, LibraryCatalog, Project, TriggerRecord } from "../../types";
import { PanelSection, ScrollArea } from "../../ui";
import { actionSummary } from "./scriptInventory";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepBranchHint } from "./scriptActionCatalog";

const STEP_LIST_HELP =
  "Realmz scripts have eight ordered CODE/ID slots. Select a slot to edit it, then apply the draft; moving, duplicating, or clearing a step affects only that selected slot.";

export function ActionPointStepList({
  project,
  catalog,
  trigger,
  selectedSlot,
  usedStepCount,
  firstEmptyStep,
  issueCounts,
  slotDraft,
  onSelectSlot,
  flowPreview
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  trigger: TriggerRecord;
  selectedSlot: number;
  usedStepCount: number;
  firstEmptyStep: number | null | undefined;
  issueCounts: Map<number, { errors: number; warnings: number }>;
  slotDraft: (slot: number, action: Action | undefined) => {
    rawCode: number;
    id: number;
    mediaRequiredForProgression: boolean;
  };
  onSelectSlot: (slot: number) => void;
  flowPreview?: ReactNode;
}) {
  return (
    <PanelSection
      title="Steps"
      eyebrow={`${usedStepCount} of 8 used`}
      count="8 max"
      density="compact"
      scroll
      className="script-steps-panel"
      actions={firstEmptyStep != null ? (
        <button type="button" className="btn btn-primary btn-xs" onClick={() => onSelectSlot(firstEmptyStep)}>
          <Plus size={12} /> Add Step
        </button>
      ) : undefined}
    >
      <p className="field-help">
        <TutorialTip title="Eight Step Slots" body={STEP_LIST_HELP} side="below">
          <span>Each card is one ordered Realmz CODE/ID slot.</span>
        </TutorialTip>
      </p>
      <ScrollArea className="realmz-step-list" aria-label="Script steps">
        {Array.from({ length: 8 }, (_, slot) => {
          const action = trigger.actions.find((candidate) => candidate.slot === slot);
          const current = slotDraft(slot, action);
          const option = actionOptionFor(current.rawCode);
          const definition = scriptActionDefinitionFor(current.rawCode);
          const changed = action
            ? current.rawCode !== action.rawCode ||
              current.id !== action.id ||
              current.mediaRequiredForProgression !== Boolean(action.mediaRequiredForProgression)
            : current.rawCode !== 0 || current.id !== 0 || current.mediaRequiredForProgression;
          const slotIssues = issueCounts.get(slot) ?? { errors: 0, warnings: 0 };
          const branchHint = scriptStepBranchHint(current.rawCode, current.id);
          const issueCount = slotIssues.errors + slotIssues.warnings;
          const storageTitle = [
            `CODE ${current.rawCode}`,
            `ID ${current.id}`,
            option.edcdShape ? "uses Action Settings" : "",
            issueCount > 0 ? `${issueCount} validation ${issueCount === 1 ? "issue" : "issues"}` : ""
          ].filter(Boolean).join(" | ");
          return (
            <button
              key={slot}
              className={`realmz-step-card${slot === selectedSlot ? " selected" : ""}${changed ? " dirty" : ""}${slotIssues.errors ? " has-error" : slotIssues.warnings ? " has-warning" : ""}`}
              type="button"
              onClick={() => onSelectSlot(slot)}
              style={{ borderColor: categoryColor(option.category) }}
            >
              <span className="slot-index">{slot + 1}</span>
              <span className="script-step-main">
                <strong>{definition.shortLabel}</strong>
                <small>{scriptActionSummary(project, catalog, current, actionSummary(action), trigger.levelType)}</small>
                {branchHint && <small className="script-step-branch-hint">{branchHint}</small>}
              </span>
              <span className="script-step-storage" title={storageTitle} aria-label={storageTitle}>
                <span><small>CODE</small><strong>{current.rawCode}</strong></span>
                <span><small>ID</small><strong>{current.id}</strong></span>
              </span>
            </button>
          );
        })}
      </ScrollArea>
      {flowPreview}
    </PanelSection>
  );
}
