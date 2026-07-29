import { useEffect, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { Project, ProjectCommand } from "../types";
import { PanelHeader, WorkbenchTabs, type WorkbenchTabOption } from "../ui";
import {
  RemakeScriptingEditor,
  type RemakeScriptingSection
} from "./scripting/RemakeScriptingEditor";

const SCRIPTING_HELP = "Scripting adds Remake-only behavior without creating a second Action Point executor. Guided Safe behaviors compile into the scenario VM; advanced GDScript runs only in Remake's isolated sandbox.";

const SECTION_HELP: Record<RemakeScriptingSection, string> = {
  behaviors: "Create guided behaviors for Action Points, encounters, spells, items, monster AI, lifecycle events, and rule modifiers.",
  state: "Define typed state that persists in saves, then attach named behaviors to meaningful scenario records and hooks.",
  extensions: "Require built-in Remake extensions and use their registered semantic operations. Scenario packages cannot add executable extensions.",
  bindings: "Choose complete spell, item, encounter, AI, lifecycle, and rule implementations from compatible behaviors or extensions.",
  reference: "Search the same typed scenario API catalog used by Providence validation and Realmz Remake."
};

export function ScriptingPanel({
  project,
  activeEditor,
  onSelectEditor,
  onApplyCommand
}: {
  project: Project;
  activeEditor: string;
  onSelectEditor: (editor: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [section, setSection] = useState<RemakeScriptingSection>(() => normalizeSection(activeEditor));
  useEffect(() => setSection(normalizeSection(activeEditor)), [activeEditor]);

  if (project.authoringTarget !== "remake-enhanced") {
    return (
      <section className="rules-workbench scripting-workbench">
        <PanelHeader
          className="domain-header"
          headingLevel={1}
          title="Scripting"
          description="Choose Realmz Remake as the scenario format in Scenario before adding scripts."
          meta={project.scenario.name}
        />
        <section className="panel-card scripting-empty-state">
          <div className="section-kicker">Classic Scenario</div>
          <h2>Scripting is not enabled for this project.</h2>
          <p>The Classic authoring surface remains unchanged until you deliberately select the Remake scenario format.</p>
        </section>
      </section>
    );
  }

  const options: WorkbenchTabOption<RemakeScriptingSection>[] = [
    { value: "behaviors", label: scriptingTabLabel("Behaviors", SECTION_HELP.behaviors), meta: project.remakeRuntime.behaviors.length },
    {
      value: "state",
      label: scriptingTabLabel("State & Attachments", SECTION_HELP.state),
      meta: project.remakeRuntime.stateDefinitions.length + project.remakeRuntime.behaviorBindings.length
    },
    {
      value: "extensions",
      label: scriptingTabLabel("Extensions", SECTION_HELP.extensions),
      meta: project.remakeRuntime.requiredExtensions.length + project.remakeRuntime.semanticActions.length
    },
    {
      value: "bindings",
      label: scriptingTabLabel("Bindings", SECTION_HELP.bindings),
      meta: Object.values(project.remakeRuntime.bindings).reduce((total, bindings) => total + Object.keys(bindings).length, 0)
    },
    { value: "reference", label: scriptingTabLabel("API Reference", SECTION_HELP.reference) }
  ];

  const selectSection = (next: RemakeScriptingSection) => {
    setSection(next);
    onSelectEditor(next);
  };

  return (
    <section className="rules-workbench scripting-workbench">
      <PanelHeader
        className="domain-header"
        headingLevel={1}
        title={(
          <TutorialTip title="Scripting" body={SCRIPTING_HELP} side="right">
            <span>Scripting</span>
          </TutorialTip>
        )}
        description="Author guided behaviors, explicit state, contextual hooks, and advanced sandboxed source."
        meta={project.scenario.name}
      />
      <WorkbenchTabs
        ariaLabel="Scenario scripting editor"
        className="rules-tabs scripting-tabs"
        value={section}
        options={options}
        onChange={selectSection}
      />
      <RemakeScriptingEditor
        project={project}
        section={section}
        onApplyCommand={onApplyCommand}
      />
    </section>
  );
}

function scriptingTabLabel(label: string, help: string) {
  return (
    <TutorialTip title={label} body={help} side="right">
      <span>{label}</span>
    </TutorialTip>
  );
}

function normalizeSection(activeEditor: string): RemakeScriptingSection {
  if (activeEditor === "state" || activeEditor === "extensions" || activeEditor === "bindings" || activeEditor === "reference") return activeEditor;
  return "behaviors";
}
