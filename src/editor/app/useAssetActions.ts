import { invoke } from "@tauri-apps/api/core";
import { Dispatch } from "react";
import { fileToMediaAssetRequest, MediaAssetImportOptions, nextResourceId, requestToBrowserAsset, requestToBrowserReplacement } from "../mediaAssets";
import { EditorAction, EditorState } from "../store";
import { ManagedAssetKind, ManagedAssetLibraryScope, Project } from "../types";
import { commandError } from "../utils";

export function useAssetActions({
  state,
  dispatch,
  desktopRuntime,
  projectDir,
  selectedMapId
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  desktopRuntime: boolean;
  projectDir: string;
  selectedMapId: string | null;
}) {
  async function importMediaAssets(files: File[], kind: ManagedAssetKind, options: MediaAssetImportOptions = {}) {
    if (!state.project || files.length === 0) return;
    let project = state.project;
    try {
      dispatch({ type: "setStatus", status: `Importing ${files.length} ${kind} asset(s)...` });
      for (const file of files) {
        const request = await fileToMediaAssetRequest(file, kind, nextResourceId(project.assets ?? [], kind), options);
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

  return {
    importMediaAssets,
    updateManagedAsset,
    replaceManagedAsset,
    deleteManagedAsset
  };
}
