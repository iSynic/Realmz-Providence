import type { LibraryAsset } from "../../types";
import { type ResourceExportScope, resourceExportScope } from "../../resourceResolver";

export type AssetSection = "project" | "custom" | "realmz" | "divinity" | "records" | "advanced";

export const COPY_TO_SCENARIO_ASSETS_LABEL = "Copy to Scenario Assets";
export const ADD_TO_CUSTOM_LIBRARY_LABEL = "Add to Custom Library";

export function assetSectionHelp(section: AssetSection) {
  if (section === "project") return "Import and manage media that ships with this scenario.";
  if (section === "custom") return "Keep reusable Providence assets available to every scenario, then copy them into Scenario Assets when they should ship.";
  if (section === "realmz") return "Browse useful stock and reference media. Realmz stock stays reference-only by ID; eligible non-stock media can be copied into Scenario Assets.";
  if (section === "divinity") return "Editor UI reference material kept out of normal authoring views.";
  if (section === "records") return "Parsed scenario records and resource references.";
  return "Raw resource listings, diagnostics, and compatibility records.";
}

export function referenceAssetOwnershipGuidance(asset: LibraryAsset) {
  const scope = resourceExportScope(asset);
  if (scope === "realmz-built-in-reference") {
    return `Realmz already supplies ${resourceIdentity(asset)}. Use its existing stock ID; no scenario copy is needed.`;
  }
  if (scope === "divinity-reference") {
    return "This is non-stock reference media. Copying it creates a scenario-owned asset with a valid scenario resource ID.";
  }
  if (scope === "ui-reference") return "This is editor interface reference material and is not offered as scenario media.";
  return "Providence has not proven this asset's runtime ownership. Inspect its detail before treating it as scenario media.";
}

export function resourceScopeHelp(scope: ResourceExportScope) {
  if (scope === "ships-with-scenario") return "This resource is scenario-owned or scenario-supplied and should be packaged with the exported scenario when its writer path is supported.";
  if (scope === "realmz-built-in-reference") return "Realmz already owns this stock resource. Reference its existing ID instead of copying it into the scenario export.";
  if (scope === "divinity-reference") return "This is non-stock Divinity reference media. Copy it into Scenario Assets only when the scenario should own and ship it.";
  if (scope === "ui-reference") return "This is application interface artwork. It is useful for research but should stay out of normal scenario authoring.";
  if (scope === "custom-library") return "This asset belongs to the Providence-wide Custom Library. It remains reusable across scenarios until copied into Scenario Assets.";
  if (scope === "scenario-preview-only") return "Providence can preview this project asset, but its scenario export output is not ready yet.";
  if (scope === "scenario-blocked") return "This scenario asset needs export setup before Providence can package it.";
  return "Providence has not proven this resource's export role yet. Inspect Technical Inventory before treating it as authored scenario media.";
}

function resourceIdentity(asset: LibraryAsset) {
  if (asset.resourceType && asset.resourceId != null) return `${asset.resourceType.trim() || asset.resourceType} ${asset.resourceId}`;
  return "this resource";
}
