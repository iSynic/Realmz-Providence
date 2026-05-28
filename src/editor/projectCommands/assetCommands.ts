import { Project, ProjectCommand } from "../types";

export function attachProjectAsset(project: Project, command: Extract<ProjectCommand, { kind: "attachProjectAsset" }>) {
  return { ...project, assets: [...(project.assets ?? []), command.asset] };
}

export function replaceProjectAsset(project: Project, command: Extract<ProjectCommand, { kind: "replaceProjectAsset" }>) {
  return {
    ...project,
    assets: (project.assets ?? []).map((asset) => asset.id === command.assetId ? command.asset : asset)
  };
}

export function updateProjectAsset(project: Project, command: Extract<ProjectCommand, { kind: "updateProjectAsset" }>) {
  return {
    ...project,
    assets: (project.assets ?? []).map((asset) => asset.id === command.assetId ? { ...asset, ...command.changes } : asset)
  };
}

export function deleteProjectAsset(project: Project, command: Extract<ProjectCommand, { kind: "deleteProjectAsset" }>) {
  return {
    ...project,
    assets: (project.assets ?? []).filter((asset) => asset.id !== command.assetId)
  };
}
