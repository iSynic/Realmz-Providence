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

export function removeScenarioResource(project: Project, command: Extract<ProjectCommand, { kind: "removeScenarioResource" }>) {
  const keyMatches = (resourceType: string, resourceId: number) => resourceType === command.resourceType && resourceId === command.resourceId;
  const sourceMatches = (source: string) => !command.source || source === command.source;
  const removedScenarioResources = [
    ...(project.editorMetadata?.removedScenarioResources ?? []).filter((resource) => !keyMatches(resource.resourceType, resource.resourceId)),
    { resourceType: command.resourceType, resourceId: command.resourceId }
  ];
  const semanticEntities = (project.semanticSchema?.entities ?? []).filter((entity) => {
    const summaryType = typeof entity.summary.resourceType === "string" ? entity.summary.resourceType : typeof entity.summary.type === "string" ? entity.summary.type : "";
    const summaryId = typeof entity.summary.resourceId === "number" ? entity.summary.resourceId : null;
    return !(summaryId !== null && keyMatches(summaryType, summaryId) && sourceMatches(entity.source));
  });
  const semanticEntityIds = new Set(semanticEntities.map((entity) => entity.id));
  const semanticLinks = (project.semanticSchema?.links ?? []).filter((link) => semanticEntityIds.has(link.from) && semanticEntityIds.has(link.to));
  const reverseLinks: Project["semanticSchema"]["reverseLinks"] = {};
  for (const link of semanticLinks) {
    reverseLinks[link.from] ??= { incoming: [], outgoing: [] };
    reverseLinks[link.to] ??= { incoming: [], outgoing: [] };
    reverseLinks[link.from].outgoing.push(link.id);
    reverseLinks[link.to].incoming.push(link.id);
  }
  return {
    ...project,
    assetCatalog: {
      ...project.assetCatalog,
      pictures: (project.assetCatalog.pictures ?? []).filter((asset) => !(keyMatches(asset.resourceType, asset.resourceId) && sourceMatches(asset.source))),
      icons: (project.assetCatalog.icons ?? []).filter((asset) => !(keyMatches(asset.resourceType, asset.resourceId) && sourceMatches(asset.source))),
      sounds: (project.assetCatalog.sounds ?? []).filter((asset) => !(keyMatches(asset.resourceType, asset.resourceId) && sourceMatches(asset.source))),
      tilesets: (project.assetCatalog.tilesets ?? []).filter((asset) => !(asset.pictId != null && keyMatches("PICT", asset.pictId) && sourceMatches(asset.source)))
    },
    semanticSchema: {
      ...project.semanticSchema,
      entities: semanticEntities,
      links: semanticLinks,
      reverseLinks
    },
    editorMetadata: {
      ...project.editorMetadata,
      removedScenarioResources
    }
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
