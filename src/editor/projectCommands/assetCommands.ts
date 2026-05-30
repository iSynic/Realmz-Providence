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

export function replaceCustomLandlookAtlas(project: Project, command: Extract<ProjectCommand, { kind: "replaceCustomLandlookAtlas" }>) {
  const pictId = 300 + command.landlook;
  const linkedEntity = `landlook:${command.landlook}`;
  const nextAsset = {
    ...command.asset,
    kind: "picture" as const,
    resourceType: "PICT",
    resourceId: pictId,
    linkedEntity,
    conversion: command.asset.conversion
      ? { ...command.asset.conversion, target: "custom-landlook-atlas" as const, finalWidth: 640, finalHeight: 320 }
      : {
          target: "custom-landlook-atlas" as const,
          fitMode: null,
          scaleMode: null,
          matte: null,
          paletteMode: null,
          ditherMode: null,
          finalWidth: 640,
          finalHeight: 320,
          warnings: []
        }
  };
  const existing = (project.assets ?? []).find((asset) => asset.resourceType === "PICT" && asset.resourceId === pictId && asset.linkedEntity === linkedEntity);
  if (existing) {
    return {
      ...project,
      assets: (project.assets ?? []).map((asset) => asset.id === existing.id ? { ...nextAsset, id: existing.id } : asset)
    };
  }
  return { ...project, assets: [...(project.assets ?? []), nextAsset] };
}
