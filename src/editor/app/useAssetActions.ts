import { invoke } from "@tauri-apps/api/core";
import { Dispatch } from "react";
import { createBrowserWorkspace, inspectBrowserBundledLibraryAssetPreview, loadBrowserBundledLibraryResourceData } from "../browser/library";
import { inspectResourcePreview } from "../browser/resourcePreview";
import { saveBrowserCustomAssets } from "../browser/workspaceStore";
import {
  fileToMediaAssetRequest,
  MediaAssetImportOptions,
  nextResourceId,
  nextScenarioResourceIdInRange,
  requestToBrowserAsset,
  requestToBrowserReplacement
} from "../mediaAssets";
import { canCopyLibraryAssetToScenario, managedAssetKindForLibrary } from "../resourceResolver";
import { EditorAction, EditorState } from "../store";
import { LibraryAsset, ManagedAsset, ManagedAssetKind, ManagedAssetLibraryScope, Project, ProvidenceWorkspace, ReferenceAssetScenarioCopyKind, ReferenceAssetScenarioCopyResult } from "../types";
import { commandError } from "../utils";

export function useAssetActions({
  state,
  dispatch,
  desktopRuntime,
  workspaceDir,
  projectDir,
  selectedMapId
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  desktopRuntime: boolean;
  workspaceDir: string;
  projectDir: string;
  selectedMapId: string | null;
}) {
  async function importMediaAssets(files: File[], kind: ManagedAssetKind, options: MediaAssetImportOptions = {}) {
    if (options.libraryScope === "custom-library") {
      await importCustomLibraryAssets(files, kind, options);
      return;
    }
    if (!state.project || files.length === 0) return;
    let project = state.project;
    try {
      dispatch({ type: "setStatus", status: `Importing ${files.length} ${kind} asset(s)...` });
      for (const file of files) {
        const scenarioAssets = (project.assets ?? []).filter((asset) => asset.libraryScope !== "custom-library");
        const request = await fileToMediaAssetRequest(file, kind, nextScenarioResourceIdInRange(scenarioAssets, kind), {
          ...options,
          libraryScope: "scenario"
        });
        if (desktopRuntime) {
          project = await invoke<Project>("import_project_media_asset", { projectDir, project, request });
          dispatch({ type: "markSaved", project });
        } else {
          const asset = requestToBrowserAsset(request);
          project = { ...project, assets: [...(project.assets ?? []), asset] };
          dispatch({ type: "applyCommand", command: { kind: "attachProjectAsset", label: `Import ${asset.label}`, asset } });
        }
      }
      if (desktopRuntime) {
        dispatch({ type: "setProject", project, selectedMapId });
      }
      dispatch({ type: "setStatus", status: `Imported ${files.length} ${kind} asset(s)` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset import failed: ${commandError(error)}` });
    }
  }

  async function importCustomLibraryAssets(files: File[], kind: ManagedAssetKind, options: MediaAssetImportOptions = {}) {
    if (files.length === 0) return;
    let workspace = currentWorkspace();
    try {
      dispatch({ type: "setStatus", status: `Importing ${files.length} ${kind} asset(s) into Custom Library...` });
      for (const file of files) {
        const request = await fileToMediaAssetRequest(file, kind, nextResourceId(workspace.customAssets ?? [], kind), {
          ...options,
          libraryScope: "custom-library"
        });
        if (desktopRuntime) {
          workspace = await invoke<ProvidenceWorkspace>("import_workspace_media_asset", { workspaceDir, workspace, request });
        } else {
          const asset = {
            ...requestToBrowserAsset(request),
            libraryScope: "custom-library" as ManagedAssetLibraryScope
          };
          workspace = { ...workspace, customAssets: [...(workspace.customAssets ?? []), asset] };
          await saveBrowserCustomAssets(workspace.customAssets);
        }
        dispatch({ type: "setWorkspace", workspace });
      }
      dispatch({ type: "setStatus", status: `Imported ${files.length} ${kind} asset(s) into Custom Library` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Custom Library import failed: ${commandError(error)}` });
    }
  }

  async function updateManagedAsset(assetId: string, changes: { label?: string; resourceId?: number; libraryScope?: ManagedAssetLibraryScope }) {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "applyCommand", command: { kind: "updateProjectAsset", label: "Update asset", assetId, changes } });
      return;
    }
    try {
      const project = await invoke<Project>("update_project_asset", {
        projectDir,
        project: state.project,
        assetId,
        label: changes.label ?? null,
        resourceId: changes.resourceId ?? null,
        libraryScope: changes.libraryScope ?? null
      });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId });
      dispatch({ type: "setStatus", status: "Asset updated" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset update failed: ${commandError(error)}` });
    }
  }

  async function updateCustomLibraryAsset(assetId: string, changes: { label?: string; resourceId?: number }) {
    const workspace = currentWorkspace();
    const customAssets = (workspace.customAssets ?? []).map((asset) => asset.id === assetId ? { ...asset, ...changes } : asset);
    await commitWorkspaceCustomAssets({ ...workspace, customAssets }, "Custom Library asset updated");
  }

  async function replaceManagedAsset(assetId: string, file: File) {
    if (!state.project) return;
    const existing = state.project.assets.find((asset) => asset.id === assetId);
    if (!existing) {
      dispatch({ type: "setStatus", status: "Asset replace failed: asset no longer exists." });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: `Replacing ${existing.label}...` });
      const request = await fileToMediaAssetRequest(file, existing.kind, existing.resourceId, {
        target: existing.conversion?.target,
        resourceType: existing.resourceType,
        fitMode: existing.conversion?.fitMode ?? undefined,
        scaleMode: existing.conversion?.scaleMode ?? undefined,
        matte: existing.conversion?.matte ?? undefined,
        ditherMode: existing.conversion?.ditherMode ?? undefined
      });
      if (!desktopRuntime) {
        const asset = requestToBrowserReplacement(request, existing);
        dispatch({ type: "applyCommand", command: { kind: "replaceProjectAsset", label: `Replace ${existing.label}`, assetId, asset } });
        dispatch({ type: "setStatus", status: `Replaced ${existing.label}` });
        return;
      }
      const project = await invoke<Project>("replace_project_media_asset", {
        projectDir,
        project: state.project,
        assetId,
        request
      });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId });
      dispatch({ type: "setStatus", status: `Replaced ${existing.label}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset replace failed: ${commandError(error)}` });
    }
  }

  async function deleteManagedAsset(assetId: string) {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "applyCommand", command: { kind: "deleteProjectAsset", label: "Delete asset", assetId } });
      return;
    }
    try {
      const project = await invoke<Project>("delete_project_asset", { projectDir, project: state.project, assetId });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId });
      dispatch({ type: "setStatus", status: "Asset deleted" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset delete failed: ${commandError(error)}` });
    }
  }

  async function deleteCustomLibraryAsset(assetId: string) {
    const workspace = currentWorkspace();
    const customAssets = (workspace.customAssets ?? []).filter((asset) => asset.id !== assetId);
    await commitWorkspaceCustomAssets({ ...workspace, customAssets }, "Custom Library asset deleted");
  }

  async function addProjectAssetToCustomLibrary(assetId: string) {
    if (!state.project) return;
    const asset = state.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      dispatch({ type: "setStatus", status: "Custom Library add failed: asset no longer exists." });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: `Adding ${asset.label} to Custom Library...` });
      if (desktopRuntime) {
        const workspace = await invoke<ProvidenceWorkspace>("copy_project_asset_to_workspace", {
          projectDir,
          workspaceDir,
          workspace: currentWorkspace(),
          asset
        });
        dispatch({ type: "setWorkspace", workspace });
      } else {
        const workspace = currentWorkspace();
        const customAssets = [
          ...(workspace.customAssets ?? []),
          duplicateManagedAsset(asset, "custom-library", "workspace", "copied from scenario asset")
        ];
        await commitWorkspaceCustomAssets({ ...workspace, customAssets }, `Added ${asset.label} to Custom Library`);
      }
      dispatch({ type: "setStatus", status: `Added ${asset.label} to Custom Library` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Custom Library add failed: ${commandError(error)}` });
    }
  }

  async function copyCustomLibraryAssetToScenario(assetId: string) {
    if (!state.project) return;
    const workspaceAsset = (state.workspace?.customAssets ?? []).find((candidate) => candidate.id === assetId);
    const legacyProjectAsset = (state.project.assets ?? []).find((candidate) => candidate.id === assetId && candidate.libraryScope === "custom-library");
    const asset = workspaceAsset ?? legacyProjectAsset;
    if (!asset) {
      dispatch({ type: "setStatus", status: "Scenario copy failed: Custom Library asset no longer exists." });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: `Copying ${asset.label} to Scenario Assets...` });
      if (legacyProjectAsset) {
        const copied = duplicateManagedAsset(asset, "scenario", "project-custom-copy", "copied from legacy project custom library", nextScenarioResourceId(state.project, asset.kind));
        dispatch({ type: "applyCommand", command: { kind: "attachProjectAsset", label: `Copy ${asset.label} to Scenario Assets`, asset: copied } });
      } else if (desktopRuntime) {
        const project = await invoke<Project>("copy_workspace_asset_to_project", {
          workspaceDir,
          projectDir,
          project: state.project,
          asset,
          resourceId: nextScenarioResourceId(state.project, asset.kind)
        });
        dispatch({ type: "markSaved", project });
        dispatch({ type: "setProject", project, selectedMapId });
      } else {
        const copied = duplicateManagedAsset(asset, "scenario", "browser", "copied from workspace custom library", nextScenarioResourceId(state.project, asset.kind));
        dispatch({ type: "applyCommand", command: { kind: "attachProjectAsset", label: `Copy ${asset.label} to Scenario Assets`, asset: copied } });
      }
      dispatch({ type: "setStatus", status: `Copied ${asset.label} to Scenario Assets` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Scenario copy failed: ${commandError(error)}` });
    }
  }

  async function copyReferenceAssetToScenario(assetId: string, requestedKind?: ReferenceAssetScenarioCopyKind) {
    if (!state.project) return null;
    const asset = state.libraryCatalog?.assets.find((candidate) => candidate.id === assetId) ?? null;
    if (!asset) {
      dispatch({ type: "setStatus", status: "Reference asset copy failed: asset no longer exists." });
      return null;
    }
    if (!canCopyLibraryAssetToScenario(asset)) {
      dispatch({ type: "setStatus", status: "Reference asset already belongs to Realmz stock resources; use its existing resource ID instead of copying it." });
      return null;
    }
    const inferredKind = requestedKind ?? managedAssetKindForLibrary(asset);
    if (!asset.resourceType || (asset.resourceId == null && inferredKind !== "music")) {
      dispatch({ type: "setStatus", status: "Reference asset copy failed: resource type or ID is missing." });
      return null;
    }
    try {
      dispatch({ type: "setStatus", status: `Copying ${asset.label} to Scenario Assets...` });
      const kind = inferredKind;
      const resourceId = nextScenarioResourceId(state.project, kind);
      if (desktopRuntime) {
        const project = await invoke<Project>("copy_library_asset_to_project", {
          workspaceDir,
          projectDir,
          project: state.project,
          asset,
          resourceId,
          kind
        });
        dispatch({ type: "markSaved", project });
        dispatch({ type: "setProject", project, selectedMapId });
      } else {
        const data = await loadBrowserBundledLibraryResourceData(asset);
        if (!data) throw new Error("reference resource bytes were not available in the bundled library");
        const preview = await inspectBrowserBundledLibraryAssetPreview(asset);
        const managed = referenceLibraryAssetToManagedAsset(asset, data, preview.dataUrl, resourceId, kind);
        dispatch({ type: "applyCommand", command: { kind: "attachProjectAsset", label: `Copy ${asset.label} to Scenario Assets`, asset: managed } });
      }
      dispatch({ type: "setStatus", status: `Copied ${asset.label} to Scenario Assets` });
      return { kind, label: asset.label, resourceId } satisfies ReferenceAssetScenarioCopyResult;
    } catch (error) {
      dispatch({ type: "setStatus", status: `Reference asset copy failed: ${commandError(error)}` });
      return null;
    }
  }

  async function commitWorkspaceCustomAssets(workspace: ProvidenceWorkspace, status: string) {
    dispatch({ type: "setWorkspace", workspace });
    if (!desktopRuntime) {
      await saveBrowserCustomAssets(workspace.customAssets ?? []);
      dispatch({ type: "setStatus", status });
      return;
    }
    try {
      await invoke("save_workspace", { workspaceDir, workspace });
      dispatch({ type: "setStatus", status });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Custom Library save failed: ${commandError(error)}` });
    }
  }

  function currentWorkspace(): ProvidenceWorkspace {
    return state.workspace
      ? { ...state.workspace, customAssets: state.workspace.customAssets ?? [] }
      : createBrowserWorkspace(state.libraryCatalog, []);
  }

  return {
    importMediaAssets,
    importCustomLibraryAssets,
    updateManagedAsset,
    updateCustomLibraryAsset,
    replaceManagedAsset,
    deleteManagedAsset,
    deleteCustomLibraryAsset,
    addProjectAssetToCustomLibrary,
    copyCustomLibraryAssetToScenario,
    copyReferenceAssetToScenario
  };
}

function duplicateManagedAsset(
  asset: ManagedAsset,
  libraryScope: ManagedAssetLibraryScope,
  idPrefix: string,
  provenanceSuffix: string,
  resourceId = asset.resourceId
): ManagedAsset {
  const scenarioMusicSlot = asset.kind === "music" && libraryScope === "scenario" ? resourceId : asset.kind === "music" ? undefined : asset.scenarioMusicSlot;
  return {
    ...asset,
    id: `asset:${idPrefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    resourceId,
    scenarioMusicSlot,
    libraryScope,
    linkedEntity: asset.kind === "special-land-tile" ? `special-land-tile:${resourceId}` : asset.kind === "music" && libraryScope === "scenario" ? `scenario-music:${resourceId}` : asset.kind === "music" ? null : asset.linkedEntity,
    provenance: `${asset.provenance}; ${provenanceSuffix}`
  };
}

function referenceLibraryAssetToManagedAsset(
  asset: LibraryAsset,
  resourceData: Uint8Array,
  previewDataUrl: string | null,
  resourceId: number,
  kind = managedAssetKindForLibrary(asset)
): ManagedAsset {
  const resourceBase64 = bytesToBase64(resourceData);
  const resourceType = asset.resourceType ?? asset.type;
  const mimeType = asset.mimeType ?? mimeForResource(resourceType);
  const payloadUrl = `data:${mimeType};base64,${resourceBase64}`;
  const decodedPreview = asset.resourceType ? inspectResourcePreview(asset.resourceType, resourceData).dataUrl : null;
  const scenarioMusicSlot = kind === "music" ? resourceId : undefined;
  return {
    id: `asset:browser-reference:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    label: asset.label,
    kind,
    resourceType,
    resourceId,
    scenarioMusicSlot,
    fileName: kind === "music" ? `Custom ${resourceId} Music` : safeReferenceFileName(asset, resourceType, resourceId),
    originalPath: payloadUrl,
    previewPath: decodedPreview ?? previewDataUrl ?? payloadUrl,
    resourcePath: payloadUrl,
    mimeType,
    bytes: resourceData.byteLength,
    sha256: "browser-reference",
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: `copied from built-in Custom Library asset ${asset.source}`,
    linkedEntity: kind === "special-land-tile" ? `special-land-tile:${resourceId}` : kind === "music" ? `scenario-music:${resourceId}` : null,
    conversion: kind === "music" ? {
      target: "music",
      fitMode: null,
      scaleMode: null,
      matte: null,
      paletteMode: null,
      ditherMode: null,
      sourceWidth: null,
      sourceHeight: null,
      sourceDurationMs: null,
      sourceSampleRate: null,
      sourceChannels: null,
      finalWidth: null,
      finalHeight: null,
      warnings: []
    } : null
  };
}

function nextScenarioResourceId(project: Project, kind: ManagedAssetKind) {
  const occupied: Array<Pick<ManagedAsset, "kind" | "resourceType" | "resourceId">> = [
    ...(project.assets ?? []).filter((asset) => asset.libraryScope !== "custom-library"),
    ...(project.assetCatalog.pictures ?? []).map((asset) => ({ kind: "picture" as const, resourceType: asset.resourceType, resourceId: asset.resourceId })),
    ...(project.assetCatalog.sounds ?? []).map((asset) => ({ kind: "sound" as const, resourceType: asset.resourceType, resourceId: asset.resourceId })),
    ...(project.assetCatalog.icons ?? []).map((asset) => ({
      kind: asset.resourceId < 0 ? "special-land-tile" as const : "icon" as const,
      resourceType: asset.resourceType,
      resourceId: asset.resourceId
    })),
    ...(project.scenarioIconResources ?? []).map((asset) => ({ kind: "icon" as const, resourceType: "cicn", resourceId: asset.resourceId })),
    ...(project.semanticSchema?.entities ?? []).flatMap((entity) => {
      const resourceType = typeof entity.summary.resourceType === "string" ? entity.summary.resourceType : typeof entity.summary.type === "string" ? entity.summary.type : "";
      const resourceId = typeof entity.summary.resourceId === "number" ? entity.summary.resourceId : null;
      return resourceId !== null && (resourceType === "TEXT" || resourceType === "STR#" || resourceType === "styl")
        ? [{ kind: "text" as const, resourceType, resourceId }]
        : [];
    })
  ];
  return nextScenarioResourceIdInRange(occupied, kind);
}

function safeReferenceFileName(asset: LibraryAsset, resourceType: string, resourceId: number) {
  const label = asset.label.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  const name = label || `${resourceType.trim() || "resource"}-${resourceId}`;
  return `${name}.bin`;
}

function mimeForResource(resourceType: string) {
  if (resourceType.trim() === "MOD") return "audio/x-mod";
  if (resourceType === "snd ") return "audio/x-mac-snd";
  if (resourceType === "TEXT" || resourceType === "STR#") return "text/plain";
  if (resourceType === "PICT") return "image/pict";
  if (resourceType === "cicn") return "image/cicn";
  return "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
