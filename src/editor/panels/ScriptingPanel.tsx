import { useEffect, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { Project, ProjectCommand } from "../types";
import { PanelHeader, WorkbenchTabs, type WorkbenchTabOption } from "../ui";
import {
  RemakeScriptingEditor,
  type RemakeScriptingSection
} from "./rules/RemakeRuntimeEditor";

const SCRIPTING_HELP = "Scripting adds Remake-only behavior without creating a second Action Point executor. Safe scripts compile into the scenario VM; sandboxed and trusted GDScript use explicit runtime policies.";

const SECTION_HELP: Record<RemakeScriptingSection, string> = {
  scripts: "Create named safe, sandboxed, or trusted scripts. Safe source is parsed and compiled into the central scenario VM.",
  state: "Define typed state that persists in saves, then attach named scripts to AP/XAP slots, encounter results, or campaign lifecycle hooks.",
  extensions: "Require built-in Remake extensions and use their registered semantic operations. Scenario packages cannot add executable extensions.",
  bindings: "Connect scenario records to stable spell, item, encounter, AI, and lifecycle provider IDs."
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
    { value: "scripts", label: scriptingTabLabel("Scripts", SECTION_HELP.scripts), meta: project.remakeRuntime.scripts.length },
    {
      value: "state",
      label: scriptingTabLabel("State & Hooks", SECTION_HELP.state),
      meta: project.remakeRuntime.persistentVariables.length + project.remakeRuntime.scriptAttachments.length
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
    }
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
        description="Author Remake-only scripts, explicit state, event hooks, and built-in extension bindings."
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
  if (activeEditor === "state" || activeEditor === "extensions" || activeEditor === "bindings") return activeEditor;
  return "scripts";
}
