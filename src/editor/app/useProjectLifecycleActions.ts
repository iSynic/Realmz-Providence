import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Dispatch } from "react";
import { isBrowserPickerAbort, pickBrowserProjectSource, pickBrowserScenarioSource } from "../browser/fsAccess";
import { createBrowserWorkspace, importBrowserLibrary } from "../browser/library";
import { benchmarkBrowserProject, createBrowserProject, importBrowserScenario, openBrowserProject, validateBrowserProject } from "../browser/project";
import { LibraryDraftSpec, createLibraryDraft, updateLibraryDraft } from "../libraryDrafts";
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
      const project = createBrowserProject(projectName);
      setProjectDir(project.scenario.projectPath);
      setExportDir(defaultExportPath(roots.export, project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Created browser project ${project.scenario.name}` });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: "Creating project..." });
      const project = await invoke<Project>("create_project", { projectName, projectDir: targetProjectDir });
      setProjectDir(project.scenario.projectPath || targetProjectDir);
      setExportDir(defaultExportPath(roots.export, project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Created ${project.scenario.name}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Create failed: ${commandError(error)}` });
    }
  }

  async function chooseExistingProject() {
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser project opening needs File System Access support, such as Chrome or Edge." });
        return;
      }
      try {
        const handle = await pickBrowserProjectSource();
        try {
          const project = await openBrowserProject(handle);
          setProjectDir(`browser://${handle.name}`);
          setExportDir(defaultExportPath(roots.export, project.scenario.name));
          dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Opened browser project ${project.scenario.name}` });
        } catch (error) {
          if (!isMissingProjectJson(error)) throw error;
          const project = createBrowserProject(handle.name);
          setProjectDir(`browser://${handle.name}`);
          setExportDir(defaultExportPath(roots.export, project.scenario.name));
          dispatch({ type: "setProject", project, selectedMapId: null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Started empty browser project ${project.scenario.name}` });
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
      directory: true,
      multiple: false,
      defaultPath: roots.project,
      title: "Open Providence Project Package"
    });
    const selectedPath = normalizeDialogPath(selected);
    if (!selectedPath) return;
    setProjectDir(selectedPath);
    try {
      await openProjectFromDir(selectedPath);
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
        setExportDir(defaultExportPath(roots.export, project.scenario.name));
        dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({ type: "setStatus", status: `Imported ${handle.name} into ${project.scenario.name}` });
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
      dispatch({ type: "setStatus", status: `Imported ${pathBaseName(selectedPath)} into ${project.scenario.name}` });
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
        const handle = await pickBrowserProjectSource();
        const catalog = await importBrowserLibrary(handle, kind);
        const workspace = createBrowserWorkspace(catalog);
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
      : createBrowserWorkspace(catalog);
    dispatch({ type: "setWorkspace", workspace });
    dispatch({ type: "setLibraryCatalog", catalog });
    dispatch({ type: "setStatus", status });
    if (!desktopRuntime) return;
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
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "setStatus", status: BROWSER_PREVIEW_STATUS });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: "Saving project..." });
      const project = await invoke<Project>("save_project", { projectDir, project: state.project });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setStatus", status: "Project saved" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Save failed: ${commandError(error)}` });
    }
  }

  async function exportProject(scenarioTarget: ScenarioTarget = "providence-portable-folder") {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "setStatus", status: BROWSER_PREVIEW_STATUS });
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

  return {
    showNewProjectDialog,
    createNewProject,
    chooseExistingProject,
    importScenario,
    openLibraryHub,
    openProjectWorkbench,
    importDivinityLibraries: () => importLibraryCatalog("divinity-import"),
    importRealmzReferenceData: () => importLibraryCatalog("realmz-reference"),
    createDraftEntry,
    updateDraftEntry,
    saveProject,
    exportProject,
    validateProject,
    benchmarkProject
  };
}
