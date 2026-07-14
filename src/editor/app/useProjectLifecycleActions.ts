import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Dispatch } from "react";
import { isBrowserPickerAbort, pickBrowserProjectSource, pickBrowserScenarioSource } from "../browser/fsAccess";
import { attachGeneratedScenarioBaseline } from "../browser/generatedScenarioBaseline";
import { createBrowserWorkspace, importBrowserLibrary } from "../browser/library";
import { benchmarkBrowserProject, createBrowserProject, ensureBrowserReferenceTileAttributes, importBrowserScenario, openBrowserProject, validateBrowserProject } from "../browser/project";
import { browserProjectPackageFileName, createBrowserProjectPackageZip } from "../browser/projectPackage";
import { allowActiveBrowserProjectRestore, loadActiveBrowserProject, loadBrowserProjectRawSources, saveBrowserProject, saveNewBrowserProject, suppressActiveBrowserProjectRestore } from "../browser/projectStore";
import { createBrowserScenarioPackageZip } from "../browser/scenarioPackage";
import { persistBrowserIconLibraryEntries } from "../iconLibrary";
import { LibraryDraftSpec, createLibraryDraft, updateLibraryDraft } from "../libraryDrafts";
import { persistBrowserMonsterLibraryEntries } from "../monsterLibrary";
import { createProjectFromScenarioSeed, parseScenarioSeed, ScenarioSeed, ScenarioSeedProjectResult } from "../scenarioSeed";
import { createScenarioSeedPreflightOutcome, ScenarioSeedPreflightOutcome, ScenarioSeedTemplateSelection } from "../scenarioSeedReport";
import { BROWSER_PREVIEW_STATUS, EditorAction, EditorState } from "../store";
import { BenchmarkReport, ExportReport, LibraryCatalog, Project, ScenarioTarget, ValidationReport } from "../types";
import { commandError } from "../utils";
import {
  defaultExportPath,
  defaultProjectPath,
  isMissingProjectJson,
  isProjectEmpty,
  nextUntitledProjectName,
  normalizeDialogPath,
  parentPath,
  pathBaseName
} from "./appUtils";

export function useProjectLifecycleActions({
  state,
  dispatch,
  desktopRuntime,
  browserFileSystem,
  workspaceDir,
  projectDir,
  setProjectDir,
  exportDir,
  setExportDir,
  projectNameDraft,
  setProjectNameDraft,
  setProjectDialogOpen,
  selectedMapId,
  roots
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  workspaceDir: string;
  projectDir: string;
  setProjectDir: (value: string) => void;
  exportDir: string;
  setExportDir: (value: string) => void;
  projectNameDraft: string;
  setProjectNameDraft: (value: string) => void;
  setProjectDialogOpen: (value: boolean) => void;
  selectedMapId: string | null;
  roots: {
    scenario: string;
    project: string;
    export: string;
    divinity: string;
    realmzData: string;
  };
}) {
  function showNewProjectDialog() {
    setProjectNameDraft(nextUntitledProjectName());
    setProjectDialogOpen(true);
  }

  async function createNewProject(projectNameInput = projectNameDraft) {
    const projectName = projectNameInput.trim();
    if (!projectName) {
      dispatch({ type: "setStatus", status: "Project name is required." });
      return;
    }
    setProjectDialogOpen(false);
    const targetProjectDir = defaultProjectPath(roots.project, projectName);
    if (!desktopRuntime) {
      let project = await ensureBrowserReferenceTileAttributes(createBrowserProject(projectName));
      try {
        const generated = await attachGeneratedScenarioBaseline(project);
        project = generated.project;
        const snapshot = await saveNewBrowserProject(project, generated.rawSources);
        setProjectDir(snapshot.key);
        setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
        dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({ type: "setStatus", status: `Created and saved browser project ${snapshot.project.scenario.name}` });
      } catch (error) {
        setProjectDir(project.scenario.projectPath);
        setExportDir(defaultExportPath(roots.export, project.scenario.name));
        dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({ type: "setStatus", status: `Created browser project ${project.scenario.name}; local save failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      dispatch({ type: "setStatus", status: "Creating project..." });
      const project = await invoke<Project>("create_project", { projectName, projectDir: targetProjectDir });
      setProjectDir(project.scenario.projectPath || targetProjectDir);
      setExportDir(defaultExportPath(roots.export, project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Created ${project.scenario.name}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Create failed: ${commandError(error)}` });
    }
  }

  async function chooseExistingProject() {
    if (!desktopRuntime) {
      try {
        const handle = await pickBrowserProjectSource();
        try {
          const project = await openBrowserProject(handle);
          const snapshot = await saveBrowserProject(project);
          setProjectDir(snapshot.key);
          setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
          dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Opened and saved browser project ${snapshot.project.scenario.name}` });
        } catch (error) {
          if (!isMissingProjectJson(error)) throw error;
          if (handle.kind === "project-zip-file") throw error;
          const browserProject = await ensureBrowserReferenceTileAttributes(createBrowserProject(handle.name));
          const generated = await attachGeneratedScenarioBaseline(browserProject);
          const project = generated.project;
          const snapshot = await saveBrowserProject(project, generated.rawSources);
          setProjectDir(snapshot.key);
          setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
          dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Started browser project ${project.scenario.name}` });
        }
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: "Project selection cancelled" });
          return;
        }
        dispatch({ type: "setStatus", status: `Open failed: ${commandError(error)}` });
      }
      return;
    }
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: roots.project,
      title: "Open Providence Project",
      filters: [{
        name: "Providence Projects",
        extensions: ["providence.zip", "json"]
      }]
    });
    const selectedPath = normalizeDialogPath(selected);
    if (!selectedPath) return;
    try {
      const selectedName = pathBaseName(selectedPath).toLowerCase();
      if (selectedName === "project.json") {
        await openProjectFromDir(parentPath(selectedPath));
        return;
      }
      if (!selectedName.endsWith(".providence.zip")) {
        throw new Error("Select a .providence.zip package or a project's project.json file.");
      }
      dispatch({ type: "setStatus", status: "Opening project package..." });
      const opened = await invoke<{ projectDir: string; project: Project }>("open_project_package", {
        packagePath: selectedPath,
        projectRoot: roots.project
      });
      setProjectDir(opened.projectDir);
      setExportDir(defaultExportPath(roots.export, opened.project.scenario.name));
      dispatch({ type: "setProject", project: opened.project, selectedMapId: opened.project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Opened ${opened.project.scenario.name} from project package` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Open failed: ${commandError(error)}` });
    }
  }

  async function importScenario() {
    if (!state.project) {
      dispatch({ type: "setStatus", status: "Create or open a Providence project before importing a scenario." });
      return;
    }
    if (!isProjectEmpty(state.project)) {
      dispatch({ type: "setStatus", status: "Import is only available before the project contains maps, records, or resources." });
      return;
    }
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser scenario import needs File System Access support, such as Chrome or Edge." });
        return;
      }
      let handle;
      try {
        dispatch({ type: "setStatus", status: "Reading scenario folder in browser..." });
        handle = await pickBrowserScenarioSource();
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: "Scenario import cancelled" });
          return;
        }
        dispatch({ type: "setStatus", status: `Browser import failed: ${commandError(error)}` });
        return;
      }
      try {
        const importedProject = await importBrowserScenario(handle);
        const project = {
          ...importedProject,
          scenario: {
            ...importedProject.scenario,
            name: state.project.scenario.name,
            projectPath: state.project.scenario.projectPath
          }
        };
        const snapshot = await saveBrowserProject(project);
        setProjectDir(snapshot.key);
        setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
        dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({
          type: "setStatus",
          status: `Imported and saved ${handle.name} into ${snapshot.project.scenario.name}: ${snapshot.project.maps.length.toLocaleString()} maps, ${snapshot.project.triggers.length.toLocaleString()} action points`
        });
      } catch (error) {
        dispatch({ type: "setStatus", status: `Browser import failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: roots.scenario,
        title: "Import Realmz Scenario Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: "Importing scenario..." });
      const project = await invoke<Project>("import_scenario_into_project", {
        sourcePath: selectedPath,
        projectDir,
        projectName: state.project.scenario.name
      });
      dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({
        type: "setStatus",
        status: `Imported ${pathBaseName(selectedPath)} into ${project.scenario.name}: ${project.maps.length.toLocaleString()} maps, ${project.triggers.length.toLocaleString()} action points`
      });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Import failed: ${commandError(error)}` });
    }
  }

  async function openLibraryHub() {
    dispatch({ type: "setWorkbench", workbench: "library", tab: "combat" });
    dispatch({ type: "setActiveEditor", editor: "hub" });
    dispatch({ type: "setStatus", status: "Library workbench" });
  }

  function openProjectWorkbench() {
    dispatch({ type: "setWorkbench", workbench: "project", tab: state.project ? state.activeTab : "maps" });
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setStatus", status: state.project ? `Project workbench: ${state.project.scenario.name}` : "Project workbench" });
  }

  async function importLibraryCatalog(kind: "divinity-import" | "realmz-reference") {
    const label = kind === "divinity-import" ? "Divinity libraries" : "Realmz reference data";
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser library refresh needs File System Access support, such as Chrome or Edge." });
        return;
      }
      try {
        dispatch({ type: "setStatus", status: `Refreshing ${label} in browser...` });
        const handle = await pickBrowserScenarioSource();
        const catalog = await importBrowserLibrary(handle, kind);
        const workspace = createBrowserWorkspace(catalog, state.workspace?.customAssets ?? []);
        dispatch({ type: "setWorkspace", workspace });
        dispatch({ type: "setLibraryCatalog", catalog });
        dispatch({ type: "setWorkbench", workbench: "library", tab: kind === "divinity-import" ? "combat" : "rules" });
        dispatch({ type: "setActiveEditor", editor: "domain" });
        dispatch({ type: "setStatus", status: `Refreshed ${catalog.summary.sourceCount.toLocaleString()} ${label} source files` });
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: `${label} refresh cancelled` });
          return;
        }
        dispatch({ type: "setStatus", status: `${label} refresh failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: kind === "divinity-import" ? roots.divinity : roots.realmzData,
        title: kind === "divinity-import" ? "Refresh From Divinity Library Folder" : "Refresh From Realmz Data Files Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: `Refreshing ${label}...` });
      const command = kind === "divinity-import" ? "import_divinity_libraries" : "import_realmz_reference_data";
      const catalog = await invoke<LibraryCatalog>(command, { sourcePath: selectedPath, workspaceDir });
      const workspace = state.workspace ? { ...state.workspace, activeLibraryCatalog: catalog } : null;
      if (workspace) dispatch({ type: "setWorkspace", workspace });
      dispatch({ type: "setLibraryCatalog", catalog });
      dispatch({ type: "setWorkbench", workbench: "library", tab: kind === "divinity-import" ? "combat" : "rules" });
      dispatch({ type: "setActiveEditor", editor: "domain" });
      dispatch({ type: "setStatus", status: `Refreshed ${catalog.summary.sourceCount.toLocaleString()} ${label} source files` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `${label} refresh failed: ${commandError(error)}` });
    }
  }

  async function commitLibraryCatalog(catalog: LibraryCatalog, status: string) {
    const workspace = state.workspace
      ? { ...state.workspace, activeLibraryCatalog: catalog }
      : createBrowserWorkspace(catalog, []);
    dispatch({ type: "setWorkspace", workspace });
    dispatch({ type: "setLibraryCatalog", catalog });
    dispatch({ type: "setStatus", status });
    if (!desktopRuntime) {
      persistBrowserIconLibraryEntries(catalog);
      persistBrowserMonsterLibraryEntries(catalog);
      return;
    }
    try {
      await invoke("save_workspace", { workspaceDir, workspace });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Library save failed: ${commandError(error)}` });
    }
  }

  async function createDraftEntry(spec: LibraryDraftSpec) {
    const managedPath = state.workspace?.managedLibraryPath ?? "browser://workspace/library";
    const { catalog, entity } = createLibraryDraft(state.libraryCatalog, managedPath, spec);
    dispatch({ type: "selectEntity", entity: { type: "record", id: entity.id } });
    await commitLibraryCatalog(catalog, `Created ${entity.label}`);
  }

  async function updateDraftEntry(entityId: string, changes: { label?: string; notes?: string }) {
    if (!state.libraryCatalog) return;
    const catalog = updateLibraryDraft(state.libraryCatalog, entityId, changes);
    await commitLibraryCatalog(catalog, "Updated draft entry");
  }

  async function openProjectFromDir(dir: string) {
    dispatch({ type: "setStatus", status: "Opening project..." });
    const project = await invoke<Project>("open_project", { projectDir: dir });
    setProjectDir(dir);
    setExportDir(defaultExportPath(roots.export, project.scenario.name));
    dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
    dispatch({ type: "setTab", tab: "maps" });
    dispatch({ type: "setStatus", status: `Opened ${project.scenario.name}` });
  }

  async function saveProject() {
    if (!state.project) return false;
    if (!desktopRuntime) {
      try {
        const snapshot = await saveBrowserProject(state.project);
        setProjectDir(snapshot.key);
        dispatch({ type: "markSaved", project: snapshot.project });
        dispatch({
          type: "setStatus",
          status: "Project saved locally in this browser. Use Export to download a Providence project ZIP backup."
        });
        return true;
      } catch (error) {
        dispatch({ type: "setStatus", status: `Browser save failed: ${commandError(error)}` });
        return false;
      }
    }
    try {
      dispatch({ type: "setStatus", status: "Saving project..." });
      const project = await invoke<Project>("save_project", { projectDir, project: state.project });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setStatus", status: "Project saved" });
      return true;
    } catch (error) {
      dispatch({ type: "setStatus", status: `Save failed: ${commandError(error)}` });
      return false;
    }
  }

  function compileScenarioSeedJson(seedJson: string, templateSelection: ScenarioSeedTemplateSelection):
    | { ok: true; seed: ScenarioSeed; result: Extract<ScenarioSeedProjectResult, { ok: true }>; outcome: ScenarioSeedPreflightOutcome }
    | { ok: false; outcome: ScenarioSeedPreflightOutcome } {
    let seedInput: unknown;
    try {
      seedInput = JSON.parse(seedJson);
    } catch (error) {
      const errors = [`Invalid JSON: ${commandError(error)}`];
      return {
        ok: false,
        outcome: createScenarioSeedPreflightOutcome({
          errors,
          warnings: [],
          diagnostics: [{ severity: "error", code: "invalid-json", message: errors[0] }]
        })
      };
    }

    const parsed = parseScenarioSeed(seedInput);
    if (!parsed.ok) {
      return {
        ok: false,
        outcome: createScenarioSeedPreflightOutcome({
          errors: parsed.errors,
          warnings: parsed.warnings,
          diagnostics: parsed.errors.map((message) => ({ severity: "error", code: "parse-error", message }))
        })
      };
    }

    const customAssets = state.workspace?.customAssets ?? [];
    const seed = templateSelection === "current-project"
      ? { ...parsed.seed, baseTemplate: "current-project" }
      : parsed.seed;
    const result = createProjectFromScenarioSeed(seed, {
      customAssets,
      libraryCatalog: state.workspace?.activeLibraryCatalog ?? state.libraryCatalog,
      ...(state.project ? { baseTemplates: { "current-project": state.project } } : {})
    });
    if (!result.ok) {
      return {
        ok: false,
        outcome: createScenarioSeedPreflightOutcome({
          errors: result.errors,
          warnings: result.warnings,
          diagnostics: result.diagnostics,
          allocations: result.allocations
        })
      };
    }
    return {
      ok: true,
      seed,
      result,
      outcome: createScenarioSeedPreflightOutcome({
        errors: [],
        warnings: result.warnings,
        diagnostics: result.diagnostics,
        allocations: result.allocations
      })
    };
  }

  async function validateScenarioSeedJson(seedJson: string, templateSelection: ScenarioSeedTemplateSelection) {
    const compiled = compileScenarioSeedJson(seedJson, templateSelection);
    const outcome = compiled.outcome;
    const allocationCount = outcome.allocationSummary?.total ?? 0;
    dispatch({
      type: "setStatus",
      status: outcome.ok
        ? `Scenario JSON is valid: ${allocationCount.toLocaleString()} allocation(s), ${outcome.warnings.length.toLocaleString()} warning(s).`
        : `Scenario JSON needs repair: ${outcome.errors.length.toLocaleString()} error(s).`
    });
    return outcome;
  }

  async function createProjectFromSeedJson(seedJson: string, templateSelection: ScenarioSeedTemplateSelection) {
    const compiled = compileScenarioSeedJson(seedJson, templateSelection);
    if (!compiled.ok) {
      dispatch({ type: "setStatus", status: `Scenario JSON needs repair: ${compiled.outcome.errors.length.toLocaleString()} error(s).` });
      return compiled.outcome;
    }
    const { result, seed: parsedSeed } = compiled;
    const customAssets = state.workspace?.customAssets ?? [];
    const usesCurrentTemplate = result.allocations.baseTemplate === "current-project";

    try {
      if (!desktopRuntime) {
        let project = await ensureBrowserReferenceTileAttributes(result.project);
        let rawSources = usesCurrentTemplate && state.project
          ? await loadBrowserProjectRawSources(state.project)
          : null;
        if (!usesCurrentTemplate) {
          const generated = await attachGeneratedScenarioBaseline(project);
          project = generated.project;
          rawSources = generated.rawSources;
        }
        const snapshot = await saveNewBrowserProject(project, rawSources);
        setProjectDir(snapshot.key);
        setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
        dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        setProjectDialogOpen(false);
        dispatch({ type: "setStatus", status: scenarioSeedCreatedStatus(snapshot.project, result.warnings.length) });
        return compiled.outcome;
      }

      const requestedProjectDir = defaultProjectPath(roots.project, result.project.scenario.name);
      dispatch({ type: "setStatus", status: "Creating project from Scenario JSON..." });
      const shell = await invoke<Project>("create_project", {
        projectName: result.project.scenario.name,
        projectDir: requestedProjectDir
      });
      const targetProjectDir = shell.scenario.projectPath || requestedProjectDir;
      if (usesCurrentTemplate) {
        if (!state.project || !projectDir) throw new Error("The selected current-project template is no longer available.");
        await invoke("copy_project_template_payloads", {
          sourceProjectDir: projectDir,
          targetProjectDir
        });
      }
      const customAllocations = result.allocations.assets.filter((asset) => asset.source === "custom-library");
      const customResourceKeys = new Set(customAllocations.map((asset) => `${asset.resourceType}:${asset.resourceId}`));
      let project: Project = {
        ...result.project,
        appVersion: shell.appVersion,
        scenario: { ...result.project.scenario, projectPath: targetProjectDir },
        source: usesCurrentTemplate
          ? { ...result.project.source, rawSourcesDir: shell.source.rawSourcesDir || "raw-sources" }
          : {
              ...result.project.source,
              rawSourcesDir: shell.source.rawSourcesDir || "raw-sources",
              files: shell.source.files
            },
        assets: result.project.assets.filter((asset) => !customResourceKeys.has(`${asset.resourceType}:${asset.resourceId}`))
      };
      project = await invoke<Project>("save_project", { projectDir: targetProjectDir, project });
      for (const allocation of customAllocations) {
        const seedAsset = parsedSeed.assets?.find((asset) => asset.key === allocation.key && asset.source === "custom-library");
        const sourceAsset = seedAsset?.source === "custom-library" ? customAssets.find((asset) => asset.id === seedAsset.assetId) : null;
        if (!sourceAsset) throw new Error(`Custom Library asset for ${allocation.key} is no longer available.`);
        project = await invoke<Project>("copy_workspace_asset_to_project", {
          workspaceDir,
          projectDir: targetProjectDir,
          project,
          asset: sourceAsset,
          resourceId: allocation.resourceId
        });
      }
      setProjectDir(targetProjectDir);
      setExportDir(defaultExportPath(roots.export, project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      setProjectDialogOpen(false);
      dispatch({ type: "setStatus", status: scenarioSeedCreatedStatus(project, result.warnings.length) });
      return compiled.outcome;
    } catch (error) {
      const errors = [`Project creation failed: ${commandError(error)}`];
      dispatch({ type: "setStatus", status: errors[0] });
      return createScenarioSeedPreflightOutcome({
        errors,
        warnings: result.warnings,
        diagnostics: [...result.diagnostics, { severity: "error", code: "persistence-error", message: errors[0] }],
        allocations: result.allocations
      });
    }
  }

  async function exportProject(scenarioTarget: ScenarioTarget = "providence-portable-folder") {
    if (!state.project) return;
    if (!desktopRuntime) {
      try {
        if (scenarioTarget === "providence-portable-folder") {
          await downloadBrowserProjectPackage(state.project);
          dispatch({ type: "setStatus", status: "Downloaded Providence project ZIP package with project metadata, managed asset payloads, and captured raw sources where available." });
        } else {
          const report = await downloadBrowserScenarioPackage(state.project, scenarioTarget);
          dispatch({ type: "setExportReport", report });
          dispatch({ type: "setStatus", status: `Downloaded ${scenarioTarget === "mac-classic-folder" ? "Mac Classic" : "Windows Realmz"} scenario ZIP with ${report.passThroughFiles.length.toLocaleString()} preserved source file(s) and ${report.writtenResources.length.toLocaleString()} resource update(s).` });
        }
      } catch (error) {
        dispatch({ type: "setStatus", status: `Browser export failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: parentPath(exportDir || defaultExportPath(roots.export, state.project.scenario.name)) || roots.export,
        title: "Choose Realmz Scenario Export Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: "Exporting scenario folder..." });
      const targetExportDir = selectedPath;
      setExportDir(targetExportDir);
      const report = await invoke<ExportReport>("export_project", {
        projectDir,
        project: state.project,
        outputDir: targetExportDir,
        scenarioTarget
      });
      dispatch({ type: "setExportReport", report });
      dispatch({ type: "setStatus", status: `Exported ${report.writtenFiles.length} supported files` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Export failed: ${commandError(error)}` });
    }
  }

  async function validateProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      const validation = validateBrowserProject(state.project);
      dispatch({ type: "setValidation", validation });
      dispatch({ type: "setStatus", status: validation.ok ? "Browser validation passed" : "Browser validation found issues" });
      return;
    }
    try {
      const validation = await invoke<ValidationReport>("validate_project", { project: state.project });
      dispatch({ type: "setValidation", validation });
      dispatch({ type: "setStatus", status: validation.ok ? "Validation passed" : "Validation found issues" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Validation failed: ${commandError(error)}` });
    }
  }

  async function benchmarkProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      const report = benchmarkBrowserProject(state.project);
      dispatch({ type: "setBenchmark", report });
      dispatch({ type: "setStatus", status: `Browser benchmark checked ${report.estimatedCanvasTiles.toLocaleString()} canvas tiles` });
      return;
    }
    try {
      const report = await invoke<BenchmarkReport>("benchmark_project", { project: state.project });
      dispatch({ type: "setBenchmark", report });
      dispatch({ type: "setStatus", status: `Benchmark checked ${report.estimatedCanvasTiles.toLocaleString()} canvas tiles` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Benchmark failed: ${commandError(error)}` });
    }
  }

  async function resumeBrowserProject() {
    if (desktopRuntime) return;
    try {
      const snapshot = await loadActiveBrowserProject({ includeSuppressed: true });
      if (!snapshot) {
        dispatch({ type: "setStatus", status: "No browser-local project is available to resume." });
        return;
      }
      allowActiveBrowserProjectRestore();
      setProjectDir(snapshot.key);
      setExportDir(defaultExportPath(roots.export, snapshot.project.scenario.name));
      dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Resumed browser project ${snapshot.project.scenario.name}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Resume failed: ${commandError(error)}` });
    }
  }

  function closeProject({ discardUnsaved = false }: { discardUnsaved?: boolean } = {}) {
    if (state.dirty && !discardUnsaved) {
      dispatch({ type: "setStatus", status: "Choose Save and Close or Close Without Saving before closing this project." });
      return false;
    }
    if (!desktopRuntime) suppressActiveBrowserProjectRestore();
    setProjectDir("");
    setExportDir(defaultExportPath(roots.export, "Untitled Scenario"));
    dispatch({ type: "setProject", project: null, selectedMapId: null });
    dispatch({ type: "setWorkbench", workbench: "project", tab: "maps" });
    dispatch({ type: "setActiveEditor", editor: "hub" });
    dispatch({ type: "setStatus", status: desktopRuntime ? "Project closed" : "Project closed. Refresh will stay on the Providence start screen; use Resume Local to reopen the browser-local project." });
    return true;
  }

  function downloadProjectJsonBackup() {
    if (!state.project) return;
    downloadBrowserProjectJson(state.project);
    dispatch({ type: "setStatus", status: "Downloaded project.json backup." });
  }

  return {
    showNewProjectDialog,
    createNewProject,
    validateScenarioSeedJson,
    createProjectFromSeedJson,
    chooseExistingProject,
    resumeBrowserProject,
    closeProject,
    importScenario,
    openLibraryHub,
    openProjectWorkbench,
    importDivinityLibraries: () => importLibraryCatalog("divinity-import"),
    importRealmzReferenceData: () => importLibraryCatalog("realmz-reference"),
    createDraftEntry,
    updateDraftEntry,
    updateLibraryCatalog: commitLibraryCatalog,
    saveProject,
    downloadProjectJsonBackup,
    exportProject,
    validateProject,
    benchmarkProject
  };
}

function scenarioSeedCreatedStatus(project: Project, warningCount: number) {
  const warningSuffix = warningCount > 0 ? ` with ${warningCount.toLocaleString()} warning(s)` : "";
  return `Created ${project.scenario.name} from Scenario JSON: ${project.maps.length.toLocaleString()} map(s), ${project.triggers.length.toLocaleString()} action point(s)${warningSuffix}`;
}

function downloadBrowserProjectJson(project: Project) {
  if (typeof document === "undefined") throw new Error(BROWSER_PREVIEW_STATUS);
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "project.json";
  link.style.position = "fixed";
  link.style.left = "-10000px";
  link.style.top = "-10000px";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadBrowserProjectPackage(project: Project) {
  if (typeof document === "undefined") throw new Error(BROWSER_PREVIEW_STATUS);
  const rawSources = await loadBrowserProjectRawSources(project);
  const blob = new Blob([createBrowserProjectPackageZip(project, rawSources)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = browserProjectPackageFileName(project);
  link.style.position = "fixed";
  link.style.left = "-10000px";
  link.style.top = "-10000px";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadBrowserScenarioPackage(project: Project, target: ScenarioTarget) {
  if (typeof document === "undefined") throw new Error(BROWSER_PREVIEW_STATUS);
  const rawSources = await loadBrowserProjectRawSources(project);
  const result = createBrowserScenarioPackageZip(project, rawSources, target);
  const blob = new Blob([arrayBufferCopy(result.zip)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName;
  link.style.position = "fixed";
  link.style.left = "-10000px";
  link.style.top = "-10000px";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return result.report;
}

function arrayBufferCopy(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
