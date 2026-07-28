import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { battleSelectionDraftIssue } from "../../components/EdcdRowEditor";
import type { EdcdRowUsage } from "../../edcdRows";
import type { Project } from "../../types";
import {
  ContextualEcodeSettingsModal,
  contextualEcodeDraft
} from "./ContextualEcodeSettingsModal";

const project = {
  triggers: [],
  simpleEncounters: [],
  complexEncounters: [],
  extracodes: [{ id: 5, values: [4, 8, 0, 0, 0] }],
  messages: [],
  optionLabels: [],
  battles: [],
  maps: [],
  items: [],
  scenarioItems: [],
  treasures: [],
  shops: [],
  monsters: [],
  monsterSets: [],
  assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
} as unknown as Project;

function renderModal(sourceUsage?: EdcdRowUsage | null, rowId = 5) {
  return renderToStaticMarkup(
    <ContextualEcodeSettingsModal
      project={project}
      title="Damage Settings"
      description="Configure encounter result step 1."
      rawCode={15}
      rowId={rowId}
      shape="damage-heal"
      initialValues={[4, 8, 0, 0, 0]}
      parameterLabels={[
        { index: 0, label: "Low Damage", help: "Lowest damage.", internalName: "low", preserved: false },
        { index: 1, label: "High Damage", help: "Highest damage.", internalName: "high", preserved: false }
      ]}
      selectedSlotLabel="encounter result step 1"
      sourceUsage={sourceUsage}
      defaultWriteMode={sourceUsage?.status === "shared" ? "duplicate" : "replace"}
      allowSharedEdit={sourceUsage?.status === "shared"}
      onApply={() => undefined}
      onCancel={() => undefined}
    />
  );
}

describe("ContextualEcodeSettingsModal", () => {
  it("requires representable Classic values for staged battle range and surprise modes", () => {
    expect(battleSelectionDraftIssue(0, 0, true, false)).toContain("Battle Range High");
    expect(battleSelectionDraftIssue(0, 0, false, true)).toContain("surprise sign");
    expect(battleSelectionDraftIssue(0, 0, true, true)).toContain("Battle Range High");
    expect(battleSelectionDraftIssue(4, 8, true, true)).toBeNull();
    expect(battleSelectionDraftIssue(-4, 0, false, true)).toBeNull();
  });

  it("normalizes a complete caller-owned draft", () => {
    expect(contextualEcodeDraft([1, 2], [3, 4, 5], "duplicate")).toEqual({
      values: [1, 2, 0, 0, 0],
      secondaryValues: [3, 4, 5, 0, 0],
      writeMode: "duplicate"
    });
  });

  it("renders an accessible modal using the shared typed settings editor", () => {
    const html = renderModal(null);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Damage Settings");
    expect(html).toContain("Low Damage");
    expect(html).toContain("High Damage");
    expect(html).toContain("Technical Details");
    expect(html).toContain("Apply Settings");
    expect(html).toContain("Cancel");
  });

  it("does not request a mutation merely by opening the modal", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();

    renderToStaticMarkup(
      <ContextualEcodeSettingsModal
        project={project}
        title="Damage Settings"
        description="Configure encounter result step 1."
        rawCode={15}
        rowId={9}
        shape="damage-heal"
        initialValues={[4, 8, 0, 0, 0]}
        parameterLabels={[]}
        selectedSlotLabel="encounter result step 1"
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(project.extracodes).toEqual([{ id: 5, values: [4, 8, 0, 0, 0] }]);
  });

  it("presents missing settings without mutating them on open", () => {
    const missing = {
      rowId: 9,
      status: "missing",
      statusLabel: "Missing",
      warnings: ["Settings 9 have not been created."],
      callers: []
    } as unknown as EdcdRowUsage;
    const html = renderModal(missing, 9);

    expect(html).toContain("Missing settings");
    expect(html).toContain("Settings 9 have not been created.");
    expect(html).toContain("Step fields are ready to apply");
  });

  it("defaults shared settings to a caller-owned duplicate and lists callers", () => {
    const shared = {
      rowId: 5,
      status: "shared",
      statusLabel: "Shared",
      summary: "Damage 4 through 8.",
      warnings: ["Settings 5 are shared by two callers."],
      callers: [
        { contextKind: "simpleEncounter", triggerRecordIndex: 3, slot: 0 },
        { contextKind: "complexEncounter", triggerRecordIndex: 7, slot: 8 }
      ]
    } as unknown as EdcdRowUsage;
    const html = renderModal(shared, 10);

    expect(html).toContain("Duplicate for this result");
    expect(html).toContain("Edit shared settings");
    expect(html).toContain("Simple Encounter 3, result step 1");
    expect(html).toContain("Complex Encounter 7, result step 9");
    expect(html).toContain("Create settings 10 and leave every other caller unchanged.");
  });

  it("presents Battle's packed range, surprise, and conditional outcome semantics explicitly", () => {
    const battleProject = {
      ...project,
      triggers: [{ source: "Data ED3", recordIndex: 12, actions: [] }],
      battles: [{ id: 4 }, { id: 8 }]
    } as unknown as Project;
    const html = renderToStaticMarkup(
      <ContextualEcodeSettingsModal
        project={battleProject}
        title="Battle Settings"
        description="Configure encounter result step 1."
        rawCode={2}
        rowId={5}
        shape="battle"
        initialValues={[-4, -8, 12, 0, 10]}
        parameterLabels={[
          { index: 0, label: "Battle Number", help: "Exact battle or range low.", internalName: "battleLow", preserved: false },
          { index: 1, label: "Battle High", help: "Range high.", internalName: "battleHigh", preserved: false },
          { index: 2, label: "Sound / Revive Action", help: "Conditional target.", internalName: "soundOrReviveLossMacro", preserved: false },
          { index: 3, label: "Before Message", help: "Optional string.", internalName: "message", preserved: false },
          { index: 4, label: "Reward / Revive Mode", help: "Battle outcome.", internalName: "revivePartyFlag", preserved: false }
        ]}
        selectedSlotLabel="encounter result step 1"
        onApply={() => undefined}
        onCancel={() => undefined}
      />
    );

    expect(html).toContain("Exact battle");
    expect(html).toContain("Random battle range");
    expect(html).toContain("Surprise the party");
    expect(html).toContain("Battle Range Low");
    expect(html).toContain("Battle Range High");
    expect(html).toContain("Extra Action Point 12");
    expect(html).toContain("Revive after loss");
  });
});
