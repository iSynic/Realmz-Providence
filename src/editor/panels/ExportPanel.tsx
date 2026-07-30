import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Bug, Camera, Download, Gauge, Pause, Play, RotateCcw, SkipForward, Square, StepForward } from "lucide-react";
import {
  BenchmarkReport,
  ExportReport,
  ExportTarget,
  Project,
  ProjectCommand,
  ProvidenceWorkspace,
  RemakeBehaviorDefinition,
  RemakePreviewAssertion,
  RemakePreviewPartyMember,
  RemakePreviewProfile,
  ScenarioTarget
} from "../types";
import { InfoGrid } from "../components/InfoGrid";
import { EmptyState, EntityRow, IssueGroup, PanelHeader, ScrollArea, ValidationGate } from "../ui";
import { TutorialTip } from "../components/TutorialTip";
import {
  assetFallbacks,
  blockedSemanticObjects,
  editableSemanticRecords,
  generatedRuntimeCaches,
  resourceGaps,
  sourceByName,
  unresolvedLinks
} from "../semanticGraph";
import { requiresCompatibilityAnnex } from "../projectOrigin";

type BrowserExportTarget = "project-zip" | "mac-classic-scenario-zip" | "windows-realmz-scenario-zip";

const EXPORT_WORKBENCH_HELP = "Desktop export writes a native Realmz folder or a self-contained Realmz Remake campaign folder from the current project and reports what was written, preserved, passed through, blocked, or warned. Browser export downloads either a Providence project ZIP package or a compiled scenario ZIP.";
const EXPORT_TARGET_HELP = "Choose the package shape to write. Portable Providence is useful for internal roundtrips; Mac Classic and Windows Realmz match native runtime folder conventions; Realmz Remake writes the campaign bundle that Remake validates and installs.";
const EXPORT_ACTION_HELP = "Desktop Export Scenario Folder runs the writer for the selected target. Browser export downloads the selected ZIP artifact.";
const REMAKE_EXPORT_ACTION_HELP = "Writes campaign.json, canonical Classic documents, and packaged runtime media in the self-contained folder shape Realmz Remake validates and installs. Choose an absent or empty output folder.";
const EXPORT_JSON_HELP = "Download the current project.json directly. This is useful as a small browser backup or for inspecting the project state without extracting the ZIP package.";
const BROWSER_SCENARIO_EXPORT_HELP = "Browser scenario ZIP export compiles authored projects from canonical data. Imported projects also preserve unsupported source material from their compatibility annex. The export report calls out project-only labels, resource warnings, and missing imported material.";
const BROWSER_EXPORT_TARGET_HELP = "Choose the browser export artifact. Project ZIP is a Providence backup; Mac and Windows scenario ZIPs are compiled Realmz folders.";
const BENCHMARK_HELP = "Benchmark Project measures large-scenario UI and validation scale so release candidates do not regress on dense maps, triggers, or Action Settings.";
const EXPORT_REPORT_HELP = "The export report is the release ledger for this session: output folder, target, source files, pass-through files, resource writes, preserved resources, blocked assets, and warnings.";
const EXPORT_PLAN_HELP = "Readiness previews the current project boundary before writing: canonical compiler output, imported compatibility files, resource gaps, runtime caches, unresolved links, and blocked objects.";
const EXPORT_SOURCES_HELP = "Package contents show the compiler's expected native manifest and any imported compatibility files. Authored projects generate native files from canonical data; imported pass-through files come only from the compatibility annex.";
const REMAKE_SOURCES_HELP = "Remake package inputs are projected from canonical project records. Scenario-owned assets are packaged with immutable Classic payloads and decoded runtime media so the installed campaign does not depend on an existing Realmz scenario.";

export function ExportPanel({
  project,
  exportReport,
  benchmark,
  desktopRuntime,
  workspace,
  projectDir,
  onExport,
  onExportProjectJson,
  onBenchmark,
  onUpdatePreviewSettings,
  onApplyCommand
}: {
  project: Project | null;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  desktopRuntime: boolean;
  workspace?: ProvidenceWorkspace | null;
  projectDir?: string;
  onExport: (target?: ExportTarget) => void;
  onExportProjectJson: () => void;
  onBenchmark: () => void;
  onUpdatePreviewSettings?: (settings: ProvidenceWorkspace["remakePreview"]) => Promise<void>;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [target, setTarget] = useState<ExportTarget>("providence-portable-folder");
  const [browserTarget, setBrowserTarget] = useState<BrowserExportTarget>("project-zip");
  const plan = exportPlan(project);
  const exportTitle = desktopRuntime ? "Realmz Folder Export" : "Browser Package Export";
  const exportButtonLabel = desktopRuntime
    ? target === "realmz-remake-folder"
      ? "Export Remake Scenario Folder"
      : "Export Scenario Folder"
    : browserTarget === "mac-classic-scenario-zip"
      ? "Download Mac Scenario ZIP"
      : browserTarget === "windows-realmz-scenario-zip"
        ? "Download Windows Scenario ZIP"
        : "Download Project ZIP";
  const exportButtonHelp = desktopRuntime && target === "realmz-remake-folder"
    ? REMAKE_EXPORT_ACTION_HELP
    : !desktopRuntime && browserTarget !== "project-zip"
      ? BROWSER_SCENARIO_EXPORT_HELP
      : EXPORT_ACTION_HELP;
  const exportDisabled = !project;
  const remakeTargetSelected = desktopRuntime && target === "realmz-remake-folder";
  const selectedBrowserScenarioTarget = browserTargetToScenarioTarget(browserTarget);
  const selectedScenarioTarget = desktopRuntime ? exportTargetToScenarioTarget(target) : selectedBrowserScenarioTarget;
  const diagnostics = exportDiagnostics(project, exportReport, {
    browserTarget,
    desktopRuntime,
    plan,
    selectedScenarioTarget
  });
  return (
    <div className="editor-full-panel export-workbench">
      <section className="tab-panel export-artifact-panel">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title={exportTitle} body={EXPORT_WORKBENCH_HELP} side="below">
              <span>{exportTitle}</span>
            </TutorialTip>
          )}
        />
        <div className="export-actions">
          {desktopRuntime ? (
            <label className="field compact export-target-field">
              <TutorialTip title="Export Target" body={EXPORT_TARGET_HELP} side="below">
                <span>Target</span>
              </TutorialTip>
              <select value={target} onChange={(event) => setTarget(event.target.value as ExportTarget)}>
                <option value="providence-portable-folder">Portable Providence Folder</option>
                <option value="mac-classic-folder">Mac Classic Folder</option>
                <option value="windows-realmz-folder">Windows Realmz Folder</option>
                <option value="realmz-remake-folder">Realmz Remake Scenario Folder</option>
              </select>
            </label>
          ) : (
            <label className="field compact export-target-field">
              <TutorialTip title="Browser Export Type" body={BROWSER_EXPORT_TARGET_HELP} side="below">
                <span>Export Type</span>
              </TutorialTip>
              <select value={browserTarget} onChange={(event) => setBrowserTarget(event.target.value as BrowserExportTarget)}>
                <option value="project-zip">Providence Project ZIP</option>
                <option value="mac-classic-scenario-zip">Mac Classic Scenario ZIP</option>
                <option value="windows-realmz-scenario-zip">Windows Realmz Scenario ZIP</option>
              </select>
            </label>
          )}
          <TutorialTip title={exportButtonLabel} body={exportButtonHelp} side="below">
            <button className="btn btn-primary" disabled={exportDisabled} onClick={() => onExport(desktopRuntime ? target : selectedBrowserScenarioTarget)}>
              <Download size={14} /> {exportButtonLabel}
            </button>
          </TutorialTip>
          {!desktopRuntime ? (
            <TutorialTip title="Download Project JSON" body={EXPORT_JSON_HELP} side="below">
              <button className="btn btn-secondary" disabled={!project} onClick={onExportProjectJson}>
                <Download size={14} /> Download Project JSON
              </button>
            </TutorialTip>
          ) : null}
        </div>
        <InfoGrid
          rows={[
            ["Artifact", desktopRuntime ? exportTargetLabel(target) : browserTargetLabel(browserTarget)],
            ["Writer", remakeTargetSelected ? "Realmz Remake campaign writer" : desktopRuntime ? "Desktop folder writer" : "Browser ZIP writer"],
            ["Scenario", project?.scenario.name ?? "No project"],
            ["Diagnostics", diagnostics.length.toLocaleString()]
          ]}
        />
        {exportReport ? (
          <ExportReportSummary report={exportReport} />
        ) : (
          <EmptyState compact title="No export report yet" body="Run an export to inspect written, preserved, and blocked package contents." />
        )}
      </section>
      <RemakePreviewPanel
        desktopRuntime={desktopRuntime}
        project={project}
        projectDir={projectDir ?? ""}
        settings={workspace?.remakePreview ?? { godotExecutable: "", remakePath: "" }}
        onUpdateSettings={onUpdatePreviewSettings}
        onApplyCommand={onApplyCommand}
      />
      <section className="tab-panel">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Readiness & Sources" body={EXPORT_PLAN_HELP} side="below">
              <span>Readiness & Sources</span>
            </TutorialTip>
          )}
        />
        <div className="export-readiness-grid">
          <section className="export-readiness-column">
            <h3>Package Readiness</h3>
            <ValidationGate
              ok={Boolean(project) && diagnostics.every((diagnostic) => diagnostic.kind !== "error")}
              title="Selected package target"
              okLabel="Ready to export"
              blockedLabel={project ? "Review export blockers" : "No project loaded"}
              detail={project ? `${diagnostics.length.toLocaleString()} diagnostic note(s) for ${desktopRuntime ? exportTargetLabel(target) : browserTargetLabel(browserTarget)}.` : "Open or import a project before building an export package."}
              issues={diagnostics
                .filter((diagnostic) => diagnostic.kind === "error")
                .slice(0, 8)
                .map((diagnostic, index) => ({
                  id: `export-blocker:${index}`,
                  severity: "error",
                  message: diagnostic.message,
                  detail: diagnostic.detail
                }))}
            />
            <InfoGrid
              rows={[
                ["Writable Records", plan.editableRecords.toLocaleString()],
                ["Compiler Files", plan.exportableSources.length.toLocaleString()],
                ["Pass-through", plan.passThroughFiles.toLocaleString()],
                ["Resource Gaps", plan.resourceGaps.toLocaleString()],
                ["Asset Fallbacks", plan.assetFallbacks.toLocaleString()],
                ["Runtime Caches", plan.runtimeCaches.toLocaleString()],
                ["Unresolved Links", plan.unresolvedLinks.toLocaleString()],
                ["Blocked Objects", plan.blockedObjects.toLocaleString()],
                ["Managed Assets", plan.managedAssets.toLocaleString()]
              ]}
            />
          </section>
          <section className="export-readiness-column">
            <TutorialTip title={remakeTargetSelected ? "Remake Package Contents" : "Native Package Contents"} body={remakeTargetSelected ? REMAKE_SOURCES_HELP : EXPORT_SOURCES_HELP} side="below">
              <h3>{remakeTargetSelected ? "Remake Package Contents" : "Native Package Contents"}</h3>
            </TutorialTip>
            {remakeTargetSelected ? (
              <>
                <InfoGrid
                  rows={[
                    ["Campaign Manifest", "campaign.json"],
                    ["Classic Documents", "canonical project projection"],
                    ["Scenario Media", "packaged runtime derivatives"]
                  ]}
                />
                <EmptyState compact title="Remake-ready campaign folder" body="Providence writes the complete folder Remake validates, installs, and materializes through its normal Classic campaign workflow." />
              </>
            ) : (
              <>
                <InfoGrid
                  rows={[
                    ["Generated Files", plan.exportableSources.length.toLocaleString()],
                    ["Imported Compatibility Files", plan.passThroughSources.length.toLocaleString()]
                  ]}
                />
                <SourceRows plan={plan} />
              </>
            )}
          </section>
        </div>
      </section>
      <section className="tab-panel">
        <div className="export-review-grid">
          <section className="export-review-column">
            <PanelHeader
              className="panel-header compact"
              title={(
                <TutorialTip title="Export Diagnostics" body={EXPORT_REPORT_HELP} side="below">
                  <span>Export Diagnostics</span>
                </TutorialTip>
              )}
              meta={diagnostics.length.toLocaleString()}
            />
            <DiagnosticsList diagnostics={diagnostics} />
          </section>
          <section className="export-review-column">
            <BenchmarkSummary benchmark={benchmark} project={project} onBenchmark={onBenchmark} />
          </section>
        </div>
      </section>
    </div>
  );
}

type PreviewEntryKind =
  | "start"
  | "map"
  | "ap"
  | "battle"
  | "behavior"
  | "encounter"
  | "spell"
  | "item"
  | "monster"
  | "lifecycle"
  | "rule";
type PreviewBreakpoint = { behaviorId: string; sourceNode: string };
type PreviewIntent = {
  behaviorId: string;
  role?: string;
  hook?: string;
  targetKind?: string;
  recordId?: string;
  slot?: number | null;
};
type PreviewEvent = Record<string, unknown>;
type PreviewWatchResult = {
  path: string;
  found: boolean;
  value: unknown;
};
type PreviewAssertionCheck = {
  path?: string;
  operator?: string;
  expected?: unknown;
  actual?: unknown;
  passed: boolean;
  message?: string;
};
type PreviewAssertionReport = {
  total: number;
  passed: number;
  failed: number;
  checks: PreviewAssertionCheck[];
};
type PreviewScreenshot = {
  source: string;
  width: number;
  height: number;
};
export type BehaviorSourceNodeOption = {
  value: string;
  label: string;
  line: number | null;
};

function readPreviewIntent(): PreviewIntent | null {
  try {
    const stored = window.localStorage.getItem("providence.remakePreviewIntent");
    return stored ? JSON.parse(stored) as PreviewIntent : null;
  } catch {
    return null;
  }
}

export function previewKindForRole(role: string | undefined): PreviewEntryKind {
  return ({
    encounter: "encounter",
    spell: "spell",
    item: "item",
    "monster-ai": "monster",
    lifecycle: "lifecycle",
    "rule-modifier": "rule"
  } as Record<string, PreviewEntryKind>)[role ?? ""] ?? "behavior";
}

export function previewRoleForKind(kind: PreviewEntryKind): string {
  return ({
    encounter: "encounter",
    spell: "spell",
    item: "item",
    monster: "monster-ai",
    lifecycle: "lifecycle",
    rule: "rule-modifier"
  } as Record<string, string>)[kind] ?? "";
}

export function isBehaviorPreviewKind(kind: PreviewEntryKind) {
  return ["behavior", "encounter", "spell", "item", "monster", "lifecycle", "rule"].includes(kind);
}

export function behaviorSourceNodeOptions(behavior: RemakeBehaviorDefinition | null): BehaviorSourceNodeOption[] {
  if (!behavior?.ast || behavior.tier !== "safe") return [];
  const nodes = behavior.sourceMap?.nodes && typeof behavior.sourceMap.nodes === "object"
    ? behavior.sourceMap.nodes as Record<string, unknown>
    : behavior.sourceMap;
  const options: BehaviorSourceNodeOption[] = [];
  const used = new Set<string>();

  const visitStatements = (value: unknown, path: string) => {
    if (!Array.isArray(value)) return;
    value.forEach((candidate, index) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
      const statement = candidate as Record<string, unknown>;
      const statementPath = `${path}/${index}`;
      const explicit = typeof statement.sourceNode === "string" ? statement.sourceNode.trim() : "";
      const sourceNode = explicit || `guided${statementPath}`;
      if (!used.has(sourceNode)) {
        used.add(sourceNode);
        const source = nodes?.[sourceNode];
        const line = source && typeof source === "object" && !Array.isArray(source)
          && typeof (source as Record<string, unknown>).line === "number"
          ? Number((source as Record<string, unknown>).line)
          : null;
        options.push({
          value: sourceNode,
          label: `${line == null ? "" : `Line ${line} · `}${statementLabel(statement)}`,
          line
        });
      }
      if (statement.kind === "if") {
        visitStatements(statement.then, `${statementPath}/then`);
        visitStatements(statement.else, `${statementPath}/else`);
      } else if (statement.kind === "for") {
        visitStatements(statement.body, `${statementPath}/body`);
      } else if (statement.kind === "match") {
        if (Array.isArray(statement.cases)) {
          statement.cases.forEach((caseValue, caseIndex) => {
            if (caseValue && typeof caseValue === "object" && !Array.isArray(caseValue)) {
              visitStatements(
                (caseValue as Record<string, unknown>).body,
                `${statementPath}/cases/${caseIndex}/body`
              );
            }
          });
        }
        visitStatements(statement.default, `${statementPath}/default`);
      }
    });
  };

  visitStatements((behavior.ast as Record<string, unknown>).body, "/body");
  return options;
}

function statementLabel(statement: Record<string, unknown>) {
  const kind = String(statement.kind ?? "statement");
  if (kind === "operation") {
    return friendlyPreviewLabel(String(statement.capability ?? "Scenario operation"));
  }
  if (kind === "call") {
    return `Call ${friendlyPreviewLabel(String(statement.scriptId ?? "helper"))}`;
  }
  return ({
    if: "If / Else",
    for: "For Each",
    match: "Match",
    declare: `Create ${String(statement.name ?? "value")}`,
    assign: `Set ${String(statement.name ?? "value")}`,
    return: "Finish behavior"
  } as Record<string, string>)[kind] ?? friendlyPreviewLabel(kind);
}

function friendlyPreviewLabel(value: string) {
  const segments = value.split(".");
  return (segments[segments.length - 1] ?? value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function previewValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function newPreviewProfile(index: number): RemakePreviewProfile {
  return {
    id: `preview-${Date.now().toString(36)}-${index}`,
    name: `Test Party ${index}`,
    gold: 0,
    gems: 0,
    jewelry: 0,
    totalSeconds: 0,
    rngSeed: 1,
    gameplayProfile: "core.classic",
    location: null,
    questFlags: [],
    party: [],
    watches: [],
    assertions: []
  };
}

export function previewFixture(profile: RemakePreviewProfile | null, watches: string[] = profile?.watches ?? []) {
  if (!profile) return { watches };
  return {
    profileId: profile.id,
    gameplayProfile: profile.gameplayProfile,
    wealth: {
      gold: profile.gold,
      gems: profile.gems,
      jewelry: profile.jewelry
    },
    totalSeconds: profile.totalSeconds,
    rngSeed: profile.rngSeed,
    location: profile.location,
    questFlags: profile.questFlags,
    party: profile.party,
    watches,
    assertions: profile.assertions
  };
}

function RemakePreviewPanel({
  desktopRuntime,
  project,
  projectDir,
  settings,
  onUpdateSettings,
  onApplyCommand
}: {
  desktopRuntime: boolean;
  project: Project | null;
  projectDir: string;
  settings: ProvidenceWorkspace["remakePreview"];
  onUpdateSettings?: (settings: ProvidenceWorkspace["remakePreview"]) => Promise<void>;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [godotExecutable, setGodotExecutable] = useState(settings.godotExecutable);
  const [remakePath, setRemakePath] = useState(settings.remakePath);
  const [entryKind, setEntryKind] = useState<PreviewEntryKind>("start");
  const [entryId, setEntryId] = useState("");
  const [mapEntry, setMapEntry] = useState({ levelType: "land", levelIndex: 0, x: 0, y: 0 });
  const [status, setStatus] = useState("Not running");
  const [running, setRunning] = useState(false);
  const [runtimeEvent, setRuntimeEvent] = useState<PreviewEvent | null>(null);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [debuggerState, setDebuggerState] = useState<Record<string, unknown>>({});
  const [breakpoints, setBreakpoints] = useState<PreviewBreakpoint[]>([]);
  const [pauseOnStart, setPauseOnStart] = useState(false);
  const [breakpointNode, setBreakpointNode] = useState("");
  const [watchPath, setWatchPath] = useState("");
  const [sessionWatches, setSessionWatches] = useState<string[]>([]);
  const [watchReport, setWatchReport] = useState<PreviewWatchResult[]>([]);
  const [assertionReport, setAssertionReport] = useState<PreviewAssertionReport | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<PreviewScreenshot | null>(null);
  const [previewIntent, setPreviewIntent] = useState<PreviewIntent | null>(() => readPreviewIntent());
  const previewProfiles = project?.editorMetadata?.remakePreviewProfiles ?? [];
  const [previewProfileId, setPreviewProfileId] = useState(previewProfiles[0]?.id ?? "");
  const selectedPreviewProfile = previewProfiles.find((profile) => profile.id === previewProfileId) ?? null;

  useEffect(() => {
    if (previewProfiles.some((profile) => profile.id === previewProfileId)) return;
    setPreviewProfileId(previewProfiles[0]?.id ?? "");
  }, [previewProfileId, previewProfiles]);

  useEffect(() => {
    setSessionWatches(selectedPreviewProfile?.watches ?? []);
  }, [selectedPreviewProfile?.id]);

  useEffect(() => {
    setBreakpointNode("");
  }, [entryId]);

  useEffect(() => {
    setGodotExecutable(settings.godotExecutable);
    setRemakePath(settings.remakePath);
  }, [settings.godotExecutable, settings.remakePath]);

  useEffect(() => {
    const receiveIntent = (event: Event) => {
      const detail = (event as CustomEvent<PreviewIntent>).detail;
      if (!detail?.behaviorId) return;
      setPreviewIntent(detail);
      setEntryKind(previewKindForRole(detail.role));
      setEntryId(detail.behaviorId);
    };
    window.addEventListener("providence:preview-behavior", receiveIntent);
    const initial = readPreviewIntent();
    if (initial?.behaviorId) {
      setPreviewIntent(initial);
      setEntryKind(previewKindForRole(initial.role));
      setEntryId(initial.behaviorId);
    }
    return () => window.removeEventListener("providence:preview-behavior", receiveIntent);
  }, []);

  useEffect(() => {
    if (!desktopRuntime) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<PreviewEvent>("remake-preview-event", (event) => {
      if (disposed) return;
      const requestId = String(event.payload.requestId ?? "");
      const isDebuggerPoll = event.payload.type === "response"
        && requestId.startsWith("providence:debug-state:auto:");
      if (!isDebuggerPoll) {
        setRuntimeEvent(event.payload);
        setEvents((current) => [...current.slice(-299), event.payload]);
      }
      const summary = event.payload.summary && typeof event.payload.summary === "object"
        ? event.payload.summary as Record<string, unknown>
        : null;
      const state = event.payload.state && typeof event.payload.state === "object"
        ? event.payload.state as Record<string, unknown>
        : null;
      const nextDebugger = event.payload.debugger ?? state?.debugger ?? summary?.debugger;
      if (nextDebugger && typeof nextDebugger === "object") {
        const normalizedDebugger = { ...(nextDebugger as Record<string, unknown>) };
        setDebuggerState(normalizedDebugger);
        if (isDebuggerPoll && normalizedDebugger.paused) {
          setStatus("Paused at a Safe behavior boundary");
        }
      }
      const nextWatches = event.payload.watches ?? state?.watches ?? summary?.watches;
      if (Array.isArray(nextWatches)) {
        setWatchReport(nextWatches.filter((value): value is PreviewWatchResult => (
          Boolean(value)
          && typeof value === "object"
          && !Array.isArray(value)
          && typeof (value as Record<string, unknown>).path === "string"
        )));
      }
      const nextAssertions = event.payload.assertions ?? state?.assertions ?? summary?.assertions;
      if (nextAssertions && typeof nextAssertions === "object" && !Array.isArray(nextAssertions)) {
        const report = nextAssertions as Record<string, unknown>;
        setAssertionReport({
          total: Number(report.total ?? 0),
          passed: Number(report.passed ?? 0),
          failed: Number(report.failed ?? 0),
          checks: Array.isArray(report.checks)
            ? report.checks.filter((value): value is PreviewAssertionCheck => (
                Boolean(value) && typeof value === "object" && !Array.isArray(value)
              ))
            : []
        });
      }
      const screenshot = event.payload.screenshot;
      if (screenshot && typeof screenshot === "object" && !Array.isArray(screenshot)) {
        const image = screenshot as Record<string, unknown>;
        const mimeType = String(image.mimeType ?? "image/jpeg");
        const encoded = String(image.base64 ?? "");
        if (encoded) {
          setPreviewScreenshot({
            source: `data:${mimeType};base64,${encoded}`,
            width: Number(image.width ?? 0),
            height: Number(image.height ?? 0)
          });
        }
      }
      if (event.payload.type === "runtime-error") {
        setStatus(String(event.payload.message ?? "Remake preview runtime error"));
      } else if (event.payload.type === "response" && event.payload.status === "error") {
        setStatus(String(event.payload.message ?? "Remake preview request failed"));
      }
    }).then((release) => {
      if (disposed) release();
      else unlisten = release;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktopRuntime]);

  useEffect(() => {
    if (!desktopRuntime || !running) return;
    let disposed = false;
    const refreshDebugger = async () => {
      try {
        await invoke("send_remake_preview_command", {
          message: {
            type: "debug-state",
            requestId: `providence:debug-state:auto:${Date.now()}`
          }
        });
      } catch (error) {
        if (!disposed) setStatus(`Preview debugger refresh failed: ${String(error)}`);
      }
    };
    void refreshDebugger();
    const interval = window.setInterval(() => void refreshDebugger(), 500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [desktopRuntime, running]);

  async function applyAndRestart() {
    if (!project) return;
    const nextSettings = { godotExecutable: godotExecutable.trim(), remakePath: remakePath.trim() };
    try {
      await onUpdateSettings?.(nextSettings);
      setStatus("Exporting v3 package and starting Remake...");
      const numericId = Number.parseInt(entryId, 10);
      const selectedBehavior = isBehaviorPreviewKind(entryKind)
        ? project.remakeRuntime.behaviors.find((behavior) => behavior.id === entryId)
        : null;
      if (isBehaviorPreviewKind(entryKind) && !selectedBehavior) {
        throw new Error("Choose a behavior from this project");
      }
      const matchingIntent = previewIntent?.behaviorId === selectedBehavior?.id
        ? previewIntent
        : null;
      const selectedBinding = selectedBehavior
        ? project.remakeRuntime.behaviorBindings.find((binding) =>
            binding.behaviorId === selectedBehavior.id
            && (!matchingIntent || (
              (!matchingIntent.hook || binding.hook === matchingIntent.hook)
              && (!matchingIntent.targetKind || binding.targetKind === matchingIntent.targetKind)
              && (!matchingIntent.recordId || binding.recordId === matchingIntent.recordId)
            ))
          ) ?? null
        : null;
      const role = matchingIntent
        ? matchingIntent.role ?? selectedBehavior?.role ?? previewRoleForKind(entryKind)
        : selectedBehavior?.role ?? previewRoleForKind(entryKind);
      const hook = matchingIntent
        ? matchingIntent.hook ?? selectedBinding?.hook ?? selectedBehavior?.hook ?? ""
        : selectedBinding?.hook ?? selectedBehavior?.hook ?? "";
      const targetKind = matchingIntent
        ? matchingIntent.targetKind ?? selectedBinding?.targetKind ?? ""
        : selectedBinding?.targetKind ?? "";
      const recordId = matchingIntent
        ? matchingIntent.recordId ?? selectedBinding?.recordId ?? ""
        : selectedBinding?.recordId ?? "";
      const bindingSlot = matchingIntent
        ? matchingIntent.slot ?? selectedBinding?.slot ?? -1
        : selectedBinding?.slot ?? -1;
      setEvents([]);
      setWatchReport([]);
      setAssertionReport(null);
      setPreviewScreenshot(null);
      const report = await invoke<{
        sessionId: string;
        packagePath: string;
        packageHash: string;
        processId: number;
      }>("launch_remake_preview", {
        request: {
          projectDir,
          project,
          settings: nextSettings,
          entry: {
            kind: entryKind,
            triggerId: entryKind === "ap" ? entryId.trim() : "",
            battleId: entryKind === "battle" && Number.isFinite(numericId) ? numericId : -1,
            behaviorId: isBehaviorPreviewKind(entryKind) ? entryId.trim() : "",
            role,
            hook,
            targetKind,
            recordId,
            baseValue: 50,
            arguments: {},
            context: previewIntent?.behaviorId === entryId
              ? {
                  source: "providence-preview",
                  role: previewIntent.role ?? selectedBehavior?.role ?? "",
                  hook: previewIntent.hook ?? selectedBehavior?.hook ?? "",
                  targetKind: previewIntent.targetKind ?? "",
                  recordId: previewIntent.recordId ?? "",
                  slot: previewIntent.slot ?? null
                }
              : {
                  source: "providence-preview",
                  role: selectedBehavior?.role ?? "",
                  hook: selectedBehavior?.hook ?? ""
                },
            fixture: previewFixture(selectedPreviewProfile, sessionWatches),
            breakpoints,
            pauseOnStart,
            slot: typeof bindingSlot === "number" ? bindingSlot : -1,
            ...mapEntry
          }
        }
      });
      setRunning(true);
      setStatus(`Running package ${report.packageHash.slice(0, 12)}… in process ${report.processId}`);
    } catch (error) {
      setRunning(false);
      setStatus(`Preview failed: ${String(error)}`);
    }
  }

  async function stopPreview() {
    try {
      await invoke("stop_remake_preview");
      setRunning(false);
      setStatus("Stopped");
    } catch (error) {
      setStatus(`Could not stop preview: ${String(error)}`);
    }
  }

  async function sendPreviewCommand(type: string, extra: Record<string, unknown> = {}) {
    try {
      await invoke("send_remake_preview_command", {
        message: {
          type,
          requestId: `providence:${type}:${Date.now()}`,
          ...extra
        }
      });
    } catch (error) {
      setStatus(`Preview command failed: ${String(error)}`);
    }
  }

  function addBreakpoint() {
    const behaviorId = isBehaviorPreviewKind(entryKind) ? entryId.trim() : "";
    const sourceNode = breakpointNode.trim();
    if (!behaviorId || !sourceNode) return;
    if (breakpoints.some((entry) => entry.behaviorId === behaviorId && entry.sourceNode === sourceNode)) return;
    const next = [...breakpoints, { behaviorId, sourceNode }];
    setBreakpoints(next);
    setBreakpointNode("");
    if (running) void sendPreviewCommand("set-breakpoints", { breakpoints: next, pauseOnStart });
  }

  function removeBreakpoint(breakpoint: PreviewBreakpoint) {
    const next = breakpoints.filter((entry) => entry !== breakpoint);
    setBreakpoints(next);
    if (running) void sendPreviewCommand("set-breakpoints", { breakpoints: next, pauseOnStart });
  }

  function updatePauseOnStart(value: boolean) {
    setPauseOnStart(value);
    if (running) void sendPreviewCommand("set-breakpoints", { breakpoints, pauseOnStart: value });
  }

  function updateWatches(next: string[]) {
    const normalized = [...new Set(next.map((path) => path.trim()).filter(Boolean))].slice(0, 64);
    setSessionWatches(normalized);
    if (selectedPreviewProfile) {
      updatePreviewProfile({ watches: normalized }, "Update preview watches");
    }
    if (running) void sendPreviewCommand("set-watches", { watches: normalized });
  }

  function addWatch() {
    const path = watchPath.trim();
    if (!path || path.length > 160 || sessionWatches.includes(path)) return;
    updateWatches([...sessionWatches, path]);
    setWatchPath("");
  }

  function updatePreviewProfiles(profiles: RemakePreviewProfile[], label: string) {
    onApplyCommand?.({
      kind: "updateRemakePreviewProfiles",
      label,
      profiles
    });
  }

  function createPreviewProfile() {
    const profile = newPreviewProfile(previewProfiles.length + 1);
    updatePreviewProfiles([...previewProfiles, profile], `Create preview profile ${profile.name}`);
    setPreviewProfileId(profile.id);
  }

  function updatePreviewProfile(changes: Partial<RemakePreviewProfile>, label = "Update preview profile") {
    if (!selectedPreviewProfile) return;
    updatePreviewProfiles(
      previewProfiles.map((profile) => (
        profile.id === selectedPreviewProfile.id ? { ...profile, ...changes } : profile
      )),
      label
    );
  }

  function deletePreviewProfile() {
    if (!selectedPreviewProfile) return;
    updatePreviewProfiles(
      previewProfiles.filter((profile) => profile.id !== selectedPreviewProfile.id),
      `Delete preview profile ${selectedPreviewProfile.name}`
    );
  }

  const behaviors = project?.remakeRuntime.behaviors ?? [];
  const previewRole = previewRoleForKind(entryKind);
  const previewBehaviors = previewRole
    ? behaviors.filter((behavior) => behavior.role === previewRole)
    : behaviors;
  const paused = Boolean(debuggerState.paused);
  const frames = Array.isArray(debuggerState.callStack)
    ? debuggerState.callStack as Array<Record<string, unknown>>
    : [];
  const persistentValues = debuggerState.persistentValues && typeof debuggerState.persistentValues === "object"
    ? debuggerState.persistentValues as Record<string, unknown>
    : {};
  const selectedDebugBehavior = isBehaviorPreviewKind(entryKind)
    ? behaviors.find((behavior) => behavior.id === entryId) ?? null
    : null;
  const sourceNodeOptions = behaviorSourceNodeOptions(selectedDebugBehavior);

  return (
    <section className="tab-panel remake-preview-panel">
      <PanelHeader className="panel-header" title="Realmz Remake Preview" />
      {!desktopRuntime ? (
        <EmptyState
          compact
          title="Preview companion requires Providence desktop"
          body="Browser Providence can author, validate, and export v3 packages, but it cannot launch a local Remake process."
        />
      ) : (
        <>
          <div className="export-actions">
            <label className="field compact">
              <span>Godot executable</span>
              <input
                value={godotExecutable}
                onChange={(event) => setGodotExecutable(event.target.value)}
                placeholder="C:\Path\To\Godot.exe"
              />
            </label>
            <label className="field compact">
              <span>Remake checkout or executable</span>
              <input
                value={remakePath}
                onChange={(event) => setRemakePath(event.target.value)}
                placeholder="F:\Realmz Remake"
              />
            </label>
            <label className="field compact">
              <span>Entry point</span>
              <select
                value={entryKind}
                onChange={(event) => {
                  setEntryKind(event.target.value as PreviewEntryKind);
                  setEntryId("");
                  setPreviewIntent(null);
                }}
              >
                <option value="start">Campaign start</option>
                <option value="map">Map location</option>
                <option value="ap">Action point ID</option>
                <option value="battle">Battle ID</option>
                <option value="behavior">Scenario behavior</option>
                <option value="encounter">Encounter behavior</option>
                <option value="spell">Spell behavior</option>
                <option value="item">Item behavior</option>
                <option value="monster">Monster AI behavior</option>
                <option value="lifecycle">Lifecycle behavior</option>
                <option value="rule">Rule calculation</option>
              </select>
            </label>
            {entryKind === "map" ? (
              <>
                <label className="field compact">
                  <span>Map type</span>
                  <select
                    value={mapEntry.levelType}
                    onChange={(event) => setMapEntry({ ...mapEntry, levelType: event.target.value })}
                  >
                    <option value="land">Land</option>
                    <option value="dungeon">Dungeon</option>
                  </select>
                </label>
                {(["levelIndex", "x", "y"] as const).map((field) => (
                  <label className="field compact" key={field}>
                    <span>{field === "levelIndex" ? "Map index" : field.toUpperCase()}</span>
                    <input
                      type="number"
                      min={0}
                      value={mapEntry[field]}
                      onChange={(event) => setMapEntry({ ...mapEntry, [field]: Number(event.target.value) })}
                    />
                  </label>
                ))}
              </>
            ) : isBehaviorPreviewKind(entryKind) ? (
              <label className="field compact">
                <span>{previewRole ? `${previewRole.replace("-", " ")} behavior` : "Behavior"}</span>
                <select value={entryId} onChange={(event) => setEntryId(event.target.value)}>
                  <option value="">Choose a behavior</option>
                  {previewBehaviors.map((behavior) => (
                    <option key={behavior.id} value={behavior.id}>
                      {behavior.name} · {behavior.role}/{behavior.hook || "helper"}
                    </option>
                  ))}
                </select>
              </label>
            ) : entryKind !== "start" ? (
              <label className="field compact">
                <span>{entryKind === "ap" ? "Stable trigger ID" : "Battle ID"}</span>
                <input value={entryId} onChange={(event) => setEntryId(event.target.value)} />
              </label>
            ) : null}
            <button
              className="btn btn-primary"
              disabled={!project || !projectDir || !remakePath.trim() || ((entryKind === "ap" || entryKind === "battle" || isBehaviorPreviewKind(entryKind)) && !entryId.trim())}
              onClick={applyAndRestart}
            >
              <Play size={14} /> Apply and Restart
            </button>
            <button className="btn btn-secondary" disabled={!running} onClick={stopPreview}>
              <Square size={14} /> Stop
            </button>
          </div>
          <PreviewProfileEditor
            profile={selectedPreviewProfile}
            profiles={previewProfiles}
            selectedId={previewProfileId}
            onSelect={setPreviewProfileId}
            onCreate={createPreviewProfile}
            onDelete={deletePreviewProfile}
            onChange={updatePreviewProfile}
          />
          <InfoGrid
            rows={[
              ["Status", status],
              ["Policy", "Clean package state; Remake enforces the selected script tier"],
              ["Latest Event", runtimeEvent ? String(runtimeEvent.type ?? "event") : "none"]
            ]}
          />
          <section className="preview-debugger-dock" aria-label="Scenario debugger">
            <header>
              <div>
                <strong><Bug size={14} /> Scenario Debugger</strong>
                <small>{paused ? "Paused at a Safe behavior boundary" : running ? "Running" : "Start a preview to debug"}</small>
              </div>
              <div className="preview-debugger-controls">
                <button className="btn btn-secondary btn-xs" disabled={!running || !paused} onClick={() => sendPreviewCommand("debug-command", { action: "resume" })}>
                  <Play size={12} /> Resume
                </button>
                <button className="btn btn-secondary btn-xs" disabled={!running || !paused} onClick={() => sendPreviewCommand("debug-command", { action: "step-into" })}>
                  <StepForward size={12} /> Into
                </button>
                <button className="btn btn-secondary btn-xs" disabled={!running || !paused} onClick={() => sendPreviewCommand("debug-command", { action: "step-over" })}>
                  <SkipForward size={12} /> Over
                </button>
                <button className="btn btn-secondary btn-xs" disabled={!running || !paused} onClick={() => sendPreviewCommand("debug-command", { action: "step-out" })}>
                  <RotateCcw size={12} /> Out
                </button>
                <button className="btn btn-ghost btn-xs" disabled={!running} onClick={() => sendPreviewCommand("debug-state")}>
                  <Pause size={12} /> Refresh
                </button>
                <button className="btn btn-ghost btn-xs" disabled={!running} onClick={() => sendPreviewCommand("capture-screenshot")}>
                  <Camera size={12} /> Capture
                </button>
              </div>
            </header>
            <div className="preview-debugger-breakpoints">
              <label className="field compact checkbox-field">
                <input type="checkbox" checked={pauseOnStart} onChange={(event) => updatePauseOnStart(event.target.checked)} />
                <span>Pause on behavior start</span>
              </label>
              <label className="field compact">
                <span>Behavior block</span>
                <select
                  value={breakpointNode}
                  onChange={(event) => setBreakpointNode(event.target.value)}
                  disabled={!isBehaviorPreviewKind(entryKind) || !entryId}
                >
                  <option value="">
                    {selectedDebugBehavior?.tier === "sandboxed"
                      ? "Sandboxed scripts pause at reducer boundaries"
                      : sourceNodeOptions.length
                        ? "Choose an outline block"
                        : "No source-linked blocks"}
                  </option>
                  {sourceNodeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-secondary btn-xs" disabled={!isBehaviorPreviewKind(entryKind) || !entryId || !breakpointNode.trim()} onClick={addBreakpoint}>
                Add Breakpoint
              </button>
              {breakpoints.map((breakpoint) => (
                <button
                  type="button"
                  className="token-chip"
                  key={`${breakpoint.behaviorId}:${breakpoint.sourceNode}`}
                  onClick={() => removeBreakpoint(breakpoint)}
                  title="Remove breakpoint"
                >
                  {behaviors.find((behavior) => behavior.id === breakpoint.behaviorId)?.name ?? breakpoint.behaviorId}:{" "}
                  {behaviorSourceNodeOptions(
                    behaviors.find((behavior) => behavior.id === breakpoint.behaviorId) ?? null
                  ).find((option) => option.value === breakpoint.sourceNode)?.label ?? breakpoint.sourceNode} ×
                </button>
              ))}
            </div>
            <div className="preview-debugger-grid">
              <section>
                <h4>Call Stack & Locals</h4>
                {frames.length ? frames.map((frame, index) => (
                  <article className="preview-debug-frame" key={`${String(frame.behaviorId)}:${index}`}>
                    <strong>{String(frame.behaviorId ?? "behavior")}</strong>
                    <small>block depth {String(frame.blockDepth ?? 0)}</small>
                    <pre className="code-block">{JSON.stringify(frame.locals ?? {}, null, 2)}</pre>
                  </article>
                )) : <EmptyState compact title="No active Safe frames" body="The stack appears when a behavior is executing or paused." />}
              </section>
              <section>
                <h4>Persistent State & Watches</h4>
                <pre className="code-block">{JSON.stringify(persistentValues, null, 2)}</pre>
                <div className="preview-watch-editor">
                  <label className="field compact">
                    <span>State path</span>
                    <input
                      list="preview-watch-paths"
                      value={watchPath}
                      maxLength={160}
                      onChange={(event) => setWatchPath(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addWatch();
                        }
                      }}
                      placeholder="wealth.gold"
                    />
                  </label>
                  <button type="button" className="btn btn-secondary btn-xs" disabled={!watchPath.trim()} onClick={addWatch}>
                    Add Watch
                  </button>
                  <datalist id="preview-watch-paths">
                    {[
                      "location.levelType",
                      "location.levelIndex",
                      "location.x",
                      "location.y",
                      "wealth.gold",
                      "wealth.gems",
                      "wealth.jewelry",
                      "totalSeconds",
                      "party.0.health",
                      "party.0.spellPoints",
                      "questValues.0",
                      "debugger.pendingOperation"
                    ].map((path) => <option key={path} value={path} />)}
                  </datalist>
                </div>
                <div className="preview-watch-list">
                  {sessionWatches.map((path) => {
                    const result = watchReport.find((entry) => entry.path === path);
                    return (
                      <article className={`preview-watch-result ${result?.found ? "found" : "missing"}`} key={path}>
                        <button type="button" className="token-chip" onClick={() => updateWatches(sessionWatches.filter((entry) => entry !== path))}>
                          {path} ×
                        </button>
                        <code>{result ? result.found ? previewValue(result.value) : "not found" : "waiting…"}</code>
                      </article>
                    );
                  })}
                  {!sessionWatches.length && <small className="muted">Add a state path to keep it visible while stepping.</small>}
                </div>
              </section>
              <section>
                <h4>Event & Command Timeline</h4>
                <ScrollArea className="preview-event-timeline" aria-label="Preview event timeline">
                  {events.length ? events.slice().reverse().map((entry, index) => (
                    <EntityRow
                      key={`${events.length - index}:${String(entry.type ?? "event")}`}
                      title={String(entry.event ?? entry.type ?? "event")}
                      subtitle={String(entry.command ?? entry.status ?? "")}
                      meta={String(entry.message ?? "")}
                    />
                  )) : <EmptyState compact title="No runtime events" body="Commands, pauses, errors, and completed behavior entries appear here." />}
                </ScrollArea>
              </section>
              <section>
                <h4>Profile Assertions</h4>
                {assertionReport ? (
                  <>
                    <div className={`preview-assertion-summary ${assertionReport.failed ? "failed" : "passed"}`}>
                      <strong>{assertionReport.passed}/{assertionReport.total} passed</strong>
                      <span>{assertionReport.failed ? `${assertionReport.failed} failed` : "All checks passed"}</span>
                    </div>
                    <div className="preview-assertion-list">
                      {assertionReport.checks.map((check, index) => (
                        <article className={check.passed ? "passed" : "failed"} key={`${check.path ?? "assertion"}:${index}`}>
                          <strong>{check.passed ? "Pass" : "Fail"} · {check.path ?? check.message ?? "Invalid assertion"}</strong>
                          {check.path ? (
                            <small>
                              {friendlyPreviewLabel(check.operator ?? "equals")} {previewValue(check.expected)} · actual {previewValue(check.actual)}
                            </small>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </>
                ) : <EmptyState compact title="No assertion result" body="Run or refresh a preview to evaluate the selected test profile." />}
              </section>
              <section className="preview-screenshot-panel">
                <h4>Presentation Screenshot</h4>
                {previewScreenshot ? (
                  <>
                    <img
                      src={previewScreenshot.source}
                      alt="Current Realmz Remake preview"
                      width={previewScreenshot.width || undefined}
                      height={previewScreenshot.height || undefined}
                    />
                    <small>{previewScreenshot.width} × {previewScreenshot.height}</small>
                  </>
                ) : <EmptyState compact title="No screenshot captured" body="Capture the running Remake window when presentation state matters." />}
              </section>
            </div>
            {runtimeEvent ? (
              <details>
                <summary>Latest protocol event</summary>
                <pre className="code-block">{JSON.stringify(runtimeEvent, null, 2)}</pre>
              </details>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

export function PreviewProfileEditor({
  profile,
  profiles,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onChange
}: {
  profile: RemakePreviewProfile | null;
  profiles: RemakePreviewProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: () => void;
  onChange: (changes: Partial<RemakePreviewProfile>, label?: string) => void;
}) {
  function updatePartyMember(slot: number, changes: Partial<RemakePreviewPartyMember>) {
    if (!profile) return;
    const existing = profile.party.find((member) => member.slot === slot) ?? {
      slot,
      name: "",
      health: null,
      maximumHealth: null,
      spellPoints: null,
      maximumSpellPoints: null,
      itemIds: []
    };
    const member = { ...existing, ...changes };
    const party = [
      ...profile.party.filter((candidate) => candidate.slot !== slot),
      member
    ].sort((left, right) => left.slot - right.slot);
    onChange({ party }, `Update preview party slot ${slot + 1}`);
  }

  function updateAssertion(index: number, changes: Partial<RemakePreviewAssertion>) {
    if (!profile) return;
    onChange({
      assertions: profile.assertions.map((assertion, candidate) => (
        candidate === index ? { ...assertion, ...changes } : assertion
      ))
    }, "Update preview assertion");
  }

  return (
    <section className="preview-profile-editor" aria-label="Test profile">
      <header>
        <strong>Test Profile</strong>
      </header>
      <p className="muted">
        Profiles are Providence-only authoring data. They configure the clean party, world state, and deterministic RNG used by Apply and Restart.
      </p>
      <div className="preview-profile-toolbar">
        <label className="field compact">
          <span>Profile</span>
          <select value={selectedId} onChange={(event) => onSelect(event.target.value)}>
            <option value="">Default generated party</option>
            {profiles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>New Profile</button>
        <button type="button" className="btn btn-danger btn-xs" disabled={!profile} onClick={onDelete}>Delete</button>
      </div>
      {profile ? (
        <>
          <div className="preview-profile-grid">
            <label className="field compact">
              <span>Name</span>
              <input value={profile.name} onChange={(event) => onChange({ name: event.target.value })} />
            </label>
            <label className="field compact">
              <span>Gameplay profile</span>
              <select value={profile.gameplayProfile} onChange={(event) => onChange({ gameplayProfile: event.target.value })}>
                <option value="core.classic">Classic</option>
                <option value="core.samuel">Samuel</option>
              </select>
            </label>
            {([
              ["gold", "Gold"],
              ["gems", "Gems"],
              ["jewelry", "Jewelry"],
              ["totalSeconds", "Scenario seconds"],
              ["rngSeed", "RNG seed"]
            ] as const).map(([field, label]) => (
              <label className="field compact" key={field}>
                <span>{label}</span>
                <input
                  type="number"
                  value={profile[field]}
                  onChange={(event) => onChange({ [field]: Number(event.target.value) })}
                />
              </label>
            ))}
          </div>
          <section className="preview-profile-section">
            <header>
              <div>
                <strong>Starting location</strong>
                <small>Apply this location before launching the selected entry.</small>
              </div>
              <label className="field compact checkbox-field">
                <input
                  type="checkbox"
                  checked={profile.location != null}
                  onChange={(event) => onChange({
                    location: event.target.checked
                      ? { levelType: "land", levelIndex: 0, x: 0, y: 0 }
                      : null
                  }, "Update preview starting location")}
                />
                <span>Override campaign start</span>
              </label>
            </header>
            {profile.location ? (
              <div className="preview-profile-grid">
                <label className="field compact">
                  <span>Map type</span>
                  <select
                    value={profile.location.levelType}
                    onChange={(event) => onChange({
                      location: {
                        ...profile.location!,
                        levelType: event.target.value as "land" | "dungeon"
                      }
                    }, "Update preview map type")}
                  >
                    <option value="land">Land</option>
                    <option value="dungeon">Dungeon</option>
                  </select>
                </label>
                {(["levelIndex", "x", "y"] as const).map((field) => (
                  <label className="field compact" key={field}>
                    <span>{field === "levelIndex" ? "Map index" : field.toUpperCase()}</span>
                    <input
                      type="number"
                      min={0}
                      value={profile.location![field]}
                      onChange={(event) => onChange({
                        location: {
                          ...profile.location!,
                          [field]: Number(event.target.value)
                        }
                      }, "Update preview starting location")}
                    />
                  </label>
                ))}
              </div>
            ) : <small className="muted">Use the campaign’s normal starting location.</small>}
          </section>
          <section className="preview-profile-section">
            <header>
              <strong>Classic quest flags</strong>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onChange({
                  questFlags: [...profile.questFlags, { id: 0, value: 1 }]
                }, "Add preview quest flag")}
              >
                Add Flag
              </button>
            </header>
            {profile.questFlags.map((flag, index) => (
              <div className="preview-profile-row" key={`${index}:${flag.id}`}>
                <label className="field compact">
                  <span>Flag</span>
                  <input
                    type="number"
                    min={0}
                    value={flag.id}
                    onChange={(event) => onChange({
                      questFlags: profile.questFlags.map((candidate, candidateIndex) => (
                        candidateIndex === index ? { ...candidate, id: Number(event.target.value) } : candidate
                      ))
                    }, "Update preview quest flag")}
                  />
                </label>
                <label className="field compact">
                  <span>Value</span>
                  <input
                    type="number"
                    value={flag.value}
                    onChange={(event) => onChange({
                      questFlags: profile.questFlags.map((candidate, candidateIndex) => (
                        candidateIndex === index ? { ...candidate, value: Number(event.target.value) } : candidate
                      ))
                    }, "Update preview quest flag")}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onChange({
                    questFlags: profile.questFlags.filter((_, candidateIndex) => candidateIndex !== index)
                  }, "Remove preview quest flag")}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
          <section className="preview-profile-section">
            <header><strong>Party overrides</strong><small>Blank values keep the generated test character’s value.</small></header>
            {Array.from({ length: 6 }, (_, slot) => {
              const member = profile.party.find((candidate) => candidate.slot === slot);
              return (
                <div className="preview-party-row" key={slot}>
                  <strong>#{slot + 1}</strong>
                  <label className="field compact">
                    <span>Name</span>
                    <input value={member?.name ?? ""} onChange={(event) => updatePartyMember(slot, { name: event.target.value })} />
                  </label>
                  {([
                    ["health", "HP"],
                    ["maximumHealth", "Max HP"],
                    ["spellPoints", "SP"],
                    ["maximumSpellPoints", "Max SP"]
                  ] as const).map(([field, label]) => (
                    <label className="field compact" key={field}>
                      <span>{label}</span>
                      <input
                        type="number"
                        value={member?.[field] ?? ""}
                        onChange={(event) => updatePartyMember(slot, {
                          [field]: event.target.value === "" ? null : Number(event.target.value)
                        })}
                      />
                    </label>
                  ))}
                  <label className="field compact">
                    <span>Item IDs</span>
                    <input
                      value={member?.itemIds.join(", ") ?? ""}
                      onChange={(event) => updatePartyMember(slot, {
                        itemIds: event.target.value.split(",")
                          .map((value) => Number.parseInt(value.trim(), 10))
                          .filter(Number.isFinite)
                      })}
                      placeholder="12, 47"
                    />
                  </label>
                </div>
              );
            })}
          </section>
          <section className="preview-profile-section">
            <header>
              <strong>Assertions</strong>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onChange({
                  assertions: [...profile.assertions, { path: "wealth.gold", operator: "equals", value: "0" }]
                }, "Add preview assertion")}
              >
                Add Assertion
              </button>
            </header>
            {profile.assertions.map((assertion, index) => (
              <div className="preview-profile-row assertion" key={index}>
                <label className="field compact">
                  <span>State path</span>
                  <input value={assertion.path} onChange={(event) => updateAssertion(index, { path: event.target.value })} />
                </label>
                <label className="field compact">
                  <span>Check</span>
                  <select value={assertion.operator} onChange={(event) => updateAssertion(index, { operator: event.target.value as RemakePreviewAssertion["operator"] })}>
                    <option value="equals">Equals</option>
                    <option value="not-equals">Does not equal</option>
                    <option value="at-least">At least</option>
                    <option value="at-most">At most</option>
                  </select>
                </label>
                <label className="field compact">
                  <span>Expected</span>
                  <input value={assertion.value} onChange={(event) => updateAssertion(index, { value: event.target.value })} />
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onChange({
                    assertions: profile.assertions.filter((_, candidateIndex) => candidateIndex !== index)
                  }, "Remove preview assertion")}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        </>
      ) : (
        <EmptyState compact title="Using the default generated party" body="Create a profile to control wealth, time, location, flags, party values, inventory, watches, and assertions." />
      )}
    </section>
  );
}

function ExportReportSummary({ report }: { report: ExportReport }) {
  const rows: [string, string][] = report.target === "realmz-remake-folder" && report.remakeCounts
    ? [
        ["Output", report.outputPath],
        ["Target", exportTargetLabel(report.target)],
        ["Written Files", report.writtenFiles.length.toLocaleString()],
        ["Maps", report.remakeCounts.maps.toLocaleString()],
        ["Active Triggers", report.remakeCounts.activeTriggers.toLocaleString()],
        ["Messages", report.remakeCounts.messages.toLocaleString()],
        ["Managed Assets", report.remakeCounts.managedAssets.toLocaleString()],
        ["Packaged Asset Files", report.remakeCounts.packagedAssetPayloads.toLocaleString()],
        ["Compatibility Notes", report.warnings.length.toLocaleString()]
      ]
    : [
        ["Output", report.outputPath],
        ["Target", exportTargetLabel(report.target)],
        ["Written", report.writtenFiles.join(", ") || "none"],
        ["Pass-through", report.passThroughFiles.length.toLocaleString()],
        ["Resources", report.writtenResources.join(", ") || "none"],
        ["Preserved Resources", report.preservedResources.toLocaleString()],
        ["Blocked Assets", report.blockedAssets.join(", ") || "none"],
        ["Warnings", report.warnings.length.toLocaleString()]
      ];
  return (
    <TutorialTip title="Export Report" body={EXPORT_REPORT_HELP} side="below">
      <div>
        <InfoGrid rows={rows} />
      </div>
    </TutorialTip>
  );
}

function SourceRows({ plan }: { plan: ReturnType<typeof exportPlan> }) {
  const rows = [
    ...plan.exportableSources.map((source) => ({
      id: `exportable:${source.name}`,
      name: source.name,
      mode: "compiler-output",
      detail: source.bytes == null ? source.origin : `${source.origin} · ${source.bytes.toLocaleString()} bytes`
    })),
    ...plan.passThroughSources.map((source) => ({
      id: source.id,
      name: source.name,
      mode: "pass-through",
      detail: source.origin
    }))
  ];
  if (rows.length === 0) return <EmptyState compact title="No package files available" body="This project state has no compiler-generated or imported compatibility files." />;
  return (
    <ScrollArea className="record-table export-source-list" aria-label="Native package contents">
      {rows.map((source) => (
        <EntityRow
          key={source.id}
          title={source.name}
          subtitle={source.mode}
          meta={source.detail}
          status={source.mode === "compiler-output" ? "Generated" : "Copied"}
          statusTone={source.mode === "compiler-output" ? "success" : "info"}
        />
      ))}
    </ScrollArea>
  );
}

function DiagnosticsList({ diagnostics }: { diagnostics: ExportDiagnostic[] }) {
  if (diagnostics.length === 0) return <EmptyState compact title="No export diagnostics" body="The current project and target have no export-facing findings." />;
  return (
    <ScrollArea className="lint-results compact export-diagnostics-list" aria-label="Export diagnostics">
      <IssueGroup
        title="Current findings"
        issues={diagnostics.map((diagnostic, index) => ({
          id: `${diagnostic.kind}:${index}`,
          severity: diagnostic.kind,
          message: diagnostic.message,
          detail: diagnostic.detail
        }))}
      />
    </ScrollArea>
  );
}

function BenchmarkSummary({
  benchmark,
  project,
  onBenchmark
}: {
  benchmark: BenchmarkReport | null;
  project: Project | null;
  onBenchmark: () => void;
}) {
  return (
    <>
      <PanelHeader
        className="panel-header compact export-benchmark-header"
        title={(
          <TutorialTip title="Project Benchmark" body={BENCHMARK_HELP} side="below">
            <span>Project Benchmark</span>
          </TutorialTip>
        )}
        actions={(
          <TutorialTip title="Benchmark Project" body={BENCHMARK_HELP} side="below">
            <button className="btn btn-secondary" disabled={!project} onClick={onBenchmark}>
              <Gauge size={14} /> Benchmark Project
            </button>
          </TutorialTip>
        )}
      />
      {benchmark ? (
        <InfoGrid
          rows={[
            ["Maps", benchmark.maps.toLocaleString()],
            ["Triggers", benchmark.triggers.toLocaleString()],
            ["EDCD", benchmark.extracodes.toLocaleString()],
            ["Canvas tiles", benchmark.estimatedCanvasTiles.toLocaleString()],
            ["Validation", `${benchmark.validationMs} ms`],
            ["Result", benchmark.ok ? "Pass" : "Review"]
          ]}
        />
      ) : (
        <EmptyState compact title="No benchmark report yet" body="Run the project benchmark to measure validation and dense-scenario scale." />
      )}
    </>
  );
}

function exportTargetLabel(target: ExportReport["target"]) {
  switch (target) {
    case "realmz-remake-folder":
      return "Realmz Remake Scenario Folder";
    case "mac-classic-folder":
      return "Mac Classic Folder";
    case "windows-realmz-folder":
      return "Windows Realmz Folder";
    case "providence-portable-folder":
      return "Portable Providence Folder";
    default:
      return target;
  }
}

function exportTargetToScenarioTarget(target: ExportTarget): ScenarioTarget {
  return target === "realmz-remake-folder" ? "providence-portable-folder" : target;
}

function browserTargetLabel(target: BrowserExportTarget) {
  switch (target) {
    case "mac-classic-scenario-zip":
      return "Mac Classic Scenario ZIP";
    case "windows-realmz-scenario-zip":
      return "Windows Realmz Scenario ZIP";
    case "project-zip":
    default:
      return "Providence Project ZIP";
  }
}

function browserTargetToScenarioTarget(target: BrowserExportTarget): ScenarioTarget {
  switch (target) {
    case "mac-classic-scenario-zip":
      return "mac-classic-folder";
    case "windows-realmz-scenario-zip":
      return "windows-realmz-folder";
    case "project-zip":
    default:
      return "providence-portable-folder";
  }
}

type ExportDiagnostic = {
  kind: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

function exportDiagnostics(
  project: Project | null,
  report: ExportReport | null,
  context: {
    browserTarget: BrowserExportTarget;
    desktopRuntime: boolean;
    plan: ReturnType<typeof exportPlan>;
    selectedScenarioTarget: ScenarioTarget;
  }
): ExportDiagnostic[] {
  const diagnostics: ExportDiagnostic[] = [];
  if (report) {
    diagnostics.push(...report.warnings.map((message) => ({ kind: "warning" as const, message, detail: "Export report warning" })));
    diagnostics.push(...report.resourceWarnings.map((message) => ({ kind: "warning" as const, message, detail: "Resource export note" })));
    diagnostics.push(...report.blockedAssets.map((message) => ({ kind: "warning" as const, message, detail: "Blocked asset" })));
    diagnostics.push(...report.targetCompatibility.blockers.map((issue) => ({ kind: "error" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    diagnostics.push(...report.targetCompatibility.warnings.map((issue) => ({ kind: "warning" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    diagnostics.push(...report.targetCompatibility.notes.map((issue) => ({ kind: "info" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    return diagnostics;
  }
  if (!project) return diagnostics;
  if (
    !context.desktopRuntime &&
    context.browserTarget !== "project-zip" &&
    requiresCompatibilityAnnex(project) &&
    context.plan.exportableSources.length === 0 &&
    context.plan.passThroughSources.length === 0
  ) {
    diagnostics.push({
      kind: "warning",
      message: "This imported scenario needs its captured compatibility annex for scenario ZIP export.",
      detail: "Import a Realmz scenario or open a Providence project ZIP that includes raw-sources."
    });
  }
  diagnostics.push(...project.validation.errors.map((message) => ({ kind: "error" as const, message, detail: "Validation blocker" })));
  diagnostics.push(...project.validation.warnings.filter(isExportFacingWarning).map(issueFromPreExportWarning));
  const targetCompatibility = compatibilityForTarget(project.validation.targetCompatibility, context.selectedScenarioTarget);
  diagnostics.push(...targetCompatibility.blockers.map((issue) => ({ kind: "error" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  diagnostics.push(...targetCompatibility.warnings.map((issue) => ({ kind: "warning" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  diagnostics.push(...targetCompatibility.notes.map((issue) => ({ kind: "info" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  return diagnostics;
}

function isExportFacingWarning(message: string) {
  return /source|snapshot|export|pass-through|resource|target|unsupported|scenario package|raw/i.test(message);
}

function issueFromPreExportWarning(message: string): ExportDiagnostic {
  if (/preserved source file\(s\) will pass through unchanged/.test(message)) {
    return { kind: "info", message, detail: "Preserved source package note" };
  }
  return { kind: "warning", message, detail: "Pre-export warning" };
}

function compatibilityForTarget(buckets: Project["validation"]["targetCompatibility"], target: ScenarioTarget) {
  return {
    blockers: buckets.blockers.filter((issue) => issue.target === target || issue.target === "providence-portable-folder"),
    warnings: buckets.warnings.filter((issue) => issue.target === target || issue.target === "providence-portable-folder"),
    notes: buckets.notes.filter((issue) => issue.target === target || issue.target === "providence-portable-folder")
  };
}

function exportPlan(project: Project | null) {
  if (!project) {
    return {
      editableRecords: 0,
      passThroughFiles: 0,
      resourceGaps: 0,
      assetFallbacks: 0,
      runtimeCaches: 0,
      unresolvedLinks: 0,
      blockedObjects: 0,
      managedAssets: 0,
      exportableSources: [] as ExportPlanSource[],
      passThroughSources: [] as ExportPlanSource[]
    };
  }
  const blocked = blockedSemanticObjects(project);
  const exportableSources = project.validation.exportableFiles
    .map((name) => exportPlanSource(project, name, true))
    .filter(Boolean) as ExportPlanSource[];
  const passThroughSources = project.validation.passThroughFiles
    .map((name) => exportPlanSource(project, name))
    .filter(Boolean) as ExportPlanSource[];
  return {
    editableRecords: editableSemanticRecords(project).length,
    passThroughFiles: project.validation.passThroughFiles.length,
    resourceGaps: resourceGaps(project).length,
    assetFallbacks: assetFallbacks(project).length,
    runtimeCaches: generatedRuntimeCaches(project).length,
    unresolvedLinks: unresolvedLinks(project).length,
    blockedObjects: blocked.entities.length + blocked.records.length,
    managedAssets: project.assets.length,
    exportableSources,
    passThroughSources
  };
}

type ExportPlanSource = {
  id: string;
  name: string;
  bytes: number | null;
  origin: string;
};

function exportPlanSource(project: Project, name: string, compilerOutput = false): ExportPlanSource | null {
  const semanticSource = sourceByName(project, name);
  if (semanticSource) return semanticSource;
  const sourceFile = project.source.files.find((file) => file.name === name);
  if (sourceFile) {
    return {
      id: `source:file:${name}`,
      name,
      bytes: sourceFile.bytes,
      origin: "Imported compatibility annex"
    };
  }
  return compilerOutput ? {
    id: `compiler:file:${name}`,
    name,
    bytes: null,
    origin: "Generated from authoritative project data"
  } : null;
}
