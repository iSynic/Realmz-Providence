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
  const atlasPath = command.asset.resourcePath || command.asset.previewPath || command.asset.originalPath;
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
  const assets = existing
    ? (project.assets ?? []).map((asset) => asset.id === existing.id ? { ...nextAsset, id: existing.id } : asset)
    : [...(project.assets ?? []), nextAsset];
  return {
    ...project,
    assets,
    assetCatalog: upsertCustomLandlookAtlasTileset(project, command.landlook, pictId, atlasPath)
  };
}

function upsertCustomLandlookAtlasTileset(project: Project, landlook: number, pictId: number, imagePath: string) {
  const name = ({ 6: "Custom 1", 7: "Custom 2", 8: "Custom 3" } as Record<number, string>)[landlook] ?? `Custom ${landlook}`;
  const assetCatalog = {
    ...project.assetCatalog,
    tilesets: [...(project.assetCatalog?.tilesets ?? [])],
    pictures: project.assetCatalog?.pictures,
    icons: project.assetCatalog?.icons,
    sounds: project.assetCatalog?.sounds
  };
  const required = {
    id: `landlook-${landlook}`,
    landlook,
    name,
    source: "Scenario custom atlas",
    available: true,
    imagePath,
    pictId,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: true,
    baseTile: assetCatalog.tilesets.find((tileset) => tileset.landlook === landlook)?.baseTile ?? 156
  };
  const existingIndex = assetCatalog.tilesets.findIndex((tileset) => tileset.landlook === landlook || tileset.id === required.id);
  if (existingIndex >= 0) {
    assetCatalog.tilesets[existingIndex] = {
      ...assetCatalog.tilesets[existingIndex],
      ...required
    };
  } else {
    assetCatalog.tilesets.push(required);
  }
  return assetCatalog;
}
