import { useEffect, useMemo, useRef, useState } from "react";
import { AssetSearchHint, LibraryAsset, LibraryCatalog, ManagedAsset, ManagedAssetKind, ManagedAssetLibraryScope, Project, ProjectCommand, ReferenceAssetScenarioCopyKind, ReferenceAssetScenarioCopyResult, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { browserReferenceAtlasToken } from "../browser/atlasPaths";
import { loadBrowserScenarioResourcePreview } from "../browser/project";
import { resourcePreviewDataUrlFromBase64 } from "../browser/resourcePreview";
import { useResolvedPreviewUrl } from "../previewUrls";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { resourceUsageLinks } from "../contentLinks";
import { canCopyLibraryAssetToScenario } from "../resourceResolver";
import { tileColor } from "../components/TileSprite";
import { IssueList, ModalDialog, ModalDialogActions, ModalDialogHeader, PanelHeader, ScrollArea, SearchField, SegmentedControl } from "../ui";
import { renderListKey } from "../renderKeys";
import { MediaAssetImportOptions, SCENARIO_PICTURE_MAX_ID, SCENARIO_PICTURE_MIN_ID, SCENARIO_SPLASH_PICTURE_ID } from "../mediaAssets";
import { TutorialTip } from "../components/TutorialTip";
import {
  PRIMARY_ASSET_SECTIONS,
  TECHNICAL_ASSET_SECTIONS,
  AssetImportBar,
  AssetPagination,
  AssetPreview,
  LibraryAssetCard,
  ManagedAssetCard,
  PreviewStatusFilters,
  ResourceScopeBadge,
  ResourcePreviewContents,
  ResourcePreviewItem,
  ResourcePreviewWindow,
  SpecialLandAssetCard,
  assetAuthoringGuidance,
  assetKindFilterFromEditor,
  assetMatchesKind,
  assetMatchesSection,
  assetSectionFromEditor,
  assetSectionTitle,
  libraryAssetMatchesKind,
  libraryAssetMatchesSection,
  numberSummary,
  resourceStatus,
  estimatedPreviewStatus,
  useDeferredProjectPreview
} from "./resources/ResourceWidgets";
import { RecordsPanel } from "./RecordsPanel";
import { ADD_TO_CUSTOM_LIBRARY_LABEL, COPY_TO_SCENARIO_ASSETS_LABEL, type AssetSection, assetSectionHelp } from "./resources/assetOwnership";
import { createIconLibraryEntry } from "../iconLibrary";
import { loadLibraryResourceBase64 } from "../libraryResourceData";
import {
  findReferenceMonsterIconPair,
  referenceAssetCopyLabel,
  referenceAssetNeedsUseChoice,
  referenceIconUseDescription,
  referenceIconUseScenarioKind,
  type ReferenceIconUse
} from "./resources/referenceAssetUse";

type AssetPreviewSize = "small" | "medium" | "large";
type ManagedGalleryItem = { type: "managed"; asset: ManagedAsset; root: "project" | "workspace" };
type ProjectGalleryItem =
  | { type: "scenario"; asset: ScenarioResourceAsset }
  | ManagedGalleryItem
  | { type: "library"; asset: LibraryAsset };

const ASSET_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 0];
const ASSET_PREVIEW_SIZE_OPTIONS: Array<{ value: AssetPreviewSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" }
];

const ASSETS_WORKBENCH_HELP = "Import, preview, replace, and locate scenario media. Text and scrolling-text editing stays in Strings.";
const ASSET_KIND_FILTER_HELP = "Filter by Realmz resource family. Pictures are PICT resources, sounds are snd resources, icons and special land tiles are cicn resources, and text resources include TEXT, STR#, and styl entries.";
const UI_REFERENCE_HELP = "Divinity and Realmz editor interface art is useful for research, but it is not scenario media. Keep it hidden unless you are comparing manual/editor artwork.";
const SPECIAL_LAND_FILTER_HELP = "Special Land Tiles are 32 x 32 cicn resources painted as negative map field values. Realmz draws the landlook base tile under the transparent icon.";
const RESOURCE_FALLBACK_HELP = "Fallback warnings identify records that point at resources Providence could not resolve from the scenario or bundled Realmz libraries. Treat used missing resources as release risks.";
const TILE_ATLAS_HELP = "Tile atlases are landlook render sources. Standard Realmz atlases are reference data; scenario custom landlooks ship only when the scenario supplies them.";

export function ResourcesPanel({
  project,
  catalog,
  customAssets = [],
  selectedEntity,
  activeEditor = "domain",
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  searchHint,
  onSelectEntity,
  onImportAssets,
  onReplaceAsset,
  onUpdateAsset,
  onDeleteAsset,
  onUpdateCustomAsset,
  onDeleteCustomAsset,
  onAddAssetToCustomLibrary,
  onCopyCustomAssetToScenario,
  onCopyReferenceAssetToScenario,
  onUpdateLibraryCatalog,
  onApplyCommand,
  onSelectPaintTile
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  customAssets?: ManagedAsset[];
  selectedEntity: SelectedEntity | null;
  activeEditor?: string;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  searchHint?: AssetSearchHint | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onImportAssets?: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number; libraryScope?: ManagedAssetLibraryScope }) => void;
  onDeleteAsset?: (assetId: string) => void;
  onUpdateCustomAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteCustomAsset?: (assetId: string) => void;
  onAddAssetToCustomLibrary?: (assetId: string) => void;
  onCopyCustomAssetToScenario?: (assetId: string) => void;
  onCopyReferenceAssetToScenario?: (assetId: string, kind?: ReferenceAssetScenarioCopyKind) => Promise<ReferenceAssetScenarioCopyResult | null>;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onSelectPaintTile?: (tile: number) => void;
}) {
  const libraryAssets = catalog?.assets ?? [];
  const [sectionOverride, setSectionOverride] = useState<AssetSection | null>(null);
  const section = sectionOverride ?? assetSectionFromEditor(activeEditor);
  const [kindFilter, setKindFilter] = useState<ManagedAssetKind | "all">(() => assetKindFilterFromEditor(activeEditor));
  const [showUiReference, setShowUiReference] = useState(false);
  const [libraryPage, setLibraryPage] = useState(0);
  const [previewItem, setPreviewItem] = useState<ResourcePreviewItem | null>(null);
  const [advancedTypeId, setAdvancedTypeId] = useState<string | null>(null);
  useEffect(() => {
    setSectionOverride(null);
    setKindFilter(assetKindFilterFromEditor(activeEditor));
  }, [activeEditor]);
  const resourceTypes = useMemo(() => section === "advanced" ? schemaEntities(project, "resource type") : [], [project, section]);
  const resources = useMemo(() => section === "advanced" ? schemaEntities(project).filter((entity) => entity.type === "resource" || entity.type === "runtime-cache" || entity.type === "asset-fallback" || entity.type === "render-profile") : [], [project, section]);
  const tileAtlases = useMemo(() => section === "advanced" ? schemaEntities(project, "tile atlas") : [], [project, section]);
  const gaps = useMemo(() => section === "advanced" ? resourceGaps(project) : [], [project, section]);
  const [libraryPreviewFilter, setLibraryPreviewFilter] = useState<ResourcePreviewStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [assetPageSize, setAssetPageSize] = useState(100);
  const [assetPreviewSize, setAssetPreviewSize] = useState<AssetPreviewSize>("small");
  const [selectedAsset, setSelectedAsset] = useState<ResourcePreviewItem | null>(null);
  const [referenceUseAsset, setReferenceUseAsset] = useState<LibraryAsset | null>(null);
  const [referenceUseBusy, setReferenceUseBusy] = useState(false);
  const [referenceUseError, setReferenceUseError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const revealScenarioCopy = (result: ReferenceAssetScenarioCopyResult) => {
    setSectionOverride("project");
    setKindFilter(result.kind);
    setQuery(String(result.resourceId));
    setLibraryPage(0);
  };
  const requestReferenceAssetCopy = (assetId: string) => {
    const asset = libraryAssets.find((candidate) => candidate.id === assetId);
    if (!asset || !referenceAssetNeedsUseChoice(asset)) {
      void onCopyReferenceAssetToScenario?.(assetId).then((result) => {
        if (result) revealScenarioCopy(result);
      });
      return;
    }
    setReferenceUseError("");
    setReferenceUseAsset(asset);
  };
  const applyReferenceIconUse = async (use: ReferenceIconUse) => {
    const asset = referenceUseAsset;
    if (!asset || asset.resourceId == null) return;
    setReferenceUseBusy(true);
    setReferenceUseError("");
    let copiedToScenario: ReferenceAssetScenarioCopyResult | "monster-pair" | null = null;
    try {
      const scenarioKind = referenceIconUseScenarioKind(use);
      if (scenarioKind) {
        if (!onCopyReferenceAssetToScenario) throw new Error("Open a scenario before copying this icon.");
        copiedToScenario = await onCopyReferenceAssetToScenario(asset.id, scenarioKind);
        if (!copiedToScenario) throw new Error("The icon could not be copied. See the application status for details.");
      } else if (use === "item-icon-library") {
        if (!onUpdateLibraryCatalog) throw new Error("The Providence Icon Library is not available in this workspace.");
        const resourceBase64 = await loadLibraryResourceBase64(asset, { desktopRuntime, projectDir, workspaceDir }, catalog);
        if (!resourceBase64) throw new Error("The selected icon resource bytes could not be loaded.");
        const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog ?? null, catalog?.managedPath ?? "browser://workspace/library", {
          kind: "item-icon",
          label: asset.label,
          origin: referenceIconOrigin(asset),
          resources: [{
            role: "item",
            resourceType: "cicn",
            resourceId: Math.abs(asset.resourceId),
            label: asset.label,
            resourceBase64,
            previewPath: asset.previewPath,
            bytes: asset.bytes,
            sha256: asset.sha256
          }]
        });
        onUpdateLibraryCatalog(nextCatalog, entity ? `Added ${entity.label} to the Providence Icon Library` : "Updated Providence Icon Library");
      } else if (use === "scenario-monster-icon") {
        if (!onApplyCommand) throw new Error("Open a scenario before copying this monster icon set.");
        const pair = findReferenceMonsterIconPair(catalog, asset);
        if (!pair) throw new Error("Monster icon sets require both facing cicn resources.");
        const [baseResourceBase64, pairedResourceBase64] = await Promise.all([
          loadLibraryResourceBase64(pair.base, { desktopRuntime, projectDir, workspaceDir }, catalog),
          loadLibraryResourceBase64(pair.paired, { desktopRuntime, projectDir, workspaceDir }, catalog)
        ]);
        if (!baseResourceBase64 || !pairedResourceBase64) throw new Error("Both monster facing resources must be available.");
        const label = monsterPairLabel(pair.base.label);
        const targetBaseIconId = Math.abs(pair.base.resourceId);
        onApplyCommand({
          kind: "upsertMonsterIconOverride",
          label: `Copy ${label} to Scenario Assets`,
          override: {
            targetBaseIconId,
            sourceBaseIconId: targetBaseIconId,
            sourceKind: "monster-mash",
            sourceLabel: label,
            sourceBaseResourceBase64: baseResourceBase64,
            sourcePairedResourceBase64: pairedResourceBase64,
            imported: true
          }
        });
        copiedToScenario = "monster-pair";
      } else {
        throw new Error("This icon use is not supported.");
      }
      setReferenceUseAsset(null);
      if (copiedToScenario) {
        if (copiedToScenario === "monster-pair") {
          setSectionOverride("project");
          setKindFilter("icon");
          setQuery(asset.label);
          setLibraryPage(0);
        } else {
          revealScenarioCopy(copiedToScenario);
        }
      }
    } catch (error) {
      setReferenceUseError(error instanceof Error ? error.message : "Unable to use the selected icon.");
    } finally {
      setReferenceUseBusy(false);
    }
  };
  useEffect(() => {
    if (!searchHint) return;
    setQuery(searchHint.query ?? "");
    if (searchHint.section) setSectionOverride(searchHint.section);
    if (searchHint.kindFilter) setKindFilter(searchHint.kindFilter);
    setLibraryPreviewFilter("all");
    if (searchHint.section === "divinity") setShowUiReference(true);
    setLibraryPage(0);
  }, [searchHint?.kindFilter, searchHint?.nonce, searchHint?.query, searchHint?.section]);
  const managedGalleryItems = useMemo<ManagedGalleryItem[]>(() => {
    const scopedAssets: ManagedGalleryItem[] = section === "custom"
      ? [
          ...customAssets.map((asset) => ({ type: "managed" as const, asset, root: "workspace" as const })),
          ...(project?.assets ?? [])
            .filter((asset) => asset.libraryScope === "custom-library")
            .map((asset) => ({ type: "managed" as const, asset, root: "project" as const }))
        ]
      : section === "project"
        ? (project?.assets ?? [])
            .filter((asset) => asset.libraryScope !== "custom-library")
            .map((asset) => ({ type: "managed" as const, asset, root: "project" as const }))
        : [];
    return scopedAssets.filter(({ asset }) =>
      assetMatchesKind(asset.kind, kindFilter) &&
      (!normalizedQuery || assetSearchText(asset.label, asset.resourceType, asset.resourceId, asset.fileName).includes(normalizedQuery))
    );
  }, [customAssets, kindFilter, normalizedQuery, project?.assets, section]);
  const allScenarioResources = useMemo(() => scenarioResourceAssets(project), [project]);
  const scenarioResources = useMemo(() => allScenarioResources.filter((asset) =>
    section === "project" &&
    assetMatchesKind(asset.kind, kindFilter) &&
    (!normalizedQuery || assetSearchText(asset.entity.label, asset.resourceType, asset.resourceId, asset.source).includes(normalizedQuery))
  ), [allScenarioResources, kindFilter, normalizedQuery, section]);
  const isManagedAssetSection = section === "project" || section === "custom";
  const isReferenceAssetSection = section === "realmz" || section === "divinity";
  useEffect(() => {
    setLibraryPage(0);
  }, [section, kindFilter, normalizedQuery, libraryPreviewFilter, showUiReference, assetPageSize]);
  useEffect(() => {
    setSelectedAsset(null);
  }, [section]);
  useEffect(() => {
    if (isReferenceAssetSection && kindFilter === "picture") setKindFilter("all");
  }, [isReferenceAssetSection, kindFilter]);
  const filteredLibraryAssets = useMemo(() => libraryAssets
    .filter((asset) => {
      if (!libraryAssetMatchesSection(asset, section, showUiReference)) return false;
      if (!libraryAssetMatchesKind(asset, kindFilter)) return false;
      if (normalizedQuery && !assetSearchText(asset.label, asset.resourceType ?? "", asset.resourceId ?? null, asset.relativePath).includes(normalizedQuery)) return false;
      return true;
    }), [kindFilter, libraryAssets, normalizedQuery, section, showUiReference]);
  const libraryPreviewCounts = useMemo(() => {
    const counts = new Map<ResourcePreviewStatus | "all", number>([["all", filteredLibraryAssets.length]]);
    for (const asset of filteredLibraryAssets) {
      const status = estimatedPreviewStatus(asset);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [filteredLibraryAssets]);
  const matchingLibraryAssets = useMemo(() => libraryPreviewFilter === "all"
    ? filteredLibraryAssets
    : filteredLibraryAssets.filter((asset) => estimatedPreviewStatus(asset) === libraryPreviewFilter),
  [filteredLibraryAssets, libraryPreviewFilter]);
  const projectGalleryItems = useMemo<ProjectGalleryItem[]>(() => [
    ...scenarioResources.map((asset) => ({ type: "scenario" as const, asset })),
    ...managedGalleryItems,
    ...(section === "custom" ? filteredLibraryAssets.map((asset) => ({ type: "library" as const, asset })) : [])
  ], [filteredLibraryAssets, managedGalleryItems, scenarioResources, section]);
  const libraryPageSize = effectiveAssetPageSize(assetPageSize, matchingLibraryAssets.length);
  const projectPageSize = effectiveAssetPageSize(assetPageSize, projectGalleryItems.length);
  const libraryPageCount = Math.max(1, Math.ceil(matchingLibraryAssets.length / libraryPageSize));
  const projectPageCount = Math.max(1, Math.ceil(projectGalleryItems.length / projectPageSize));
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount - 1);
  const currentProjectPage = Math.min(libraryPage, projectPageCount - 1);
  const visibleLibraryAssets = matchingLibraryAssets.slice(currentLibraryPage * libraryPageSize, (currentLibraryPage + 1) * libraryPageSize);
  const visibleProjectItems = projectGalleryItems.slice(currentProjectPage * projectPageSize, (currentProjectPage + 1) * projectPageSize);
  const authoringGuidance = assetAuthoringGuidance(section, kindFilter);
  const selectedAdvancedType = resourceTypes.find((entity) => entity.id === advancedTypeId) ?? null;
  const advancedResources = selectedAdvancedType ? resourceMembersForType(project, selectedAdvancedType.id) : resources;
  const selectedAssetKey = selectedAsset ? resourcePreviewItemKey(selectedAsset) : "";
  useEffect(() => {
    if (!searchHint?.selectedEntityId) return;
    const item = previewItemForEntityId(
      searchHint.selectedEntityId,
      project,
      managedGalleryItems,
      allScenarioResources,
      libraryAssets,
      searchHint.section ?? section
    );
    if (!item) return;
    setSelectedAsset(item);
    const targetSection = searchHint.section ?? section;
    if (targetSection === "project" || targetSection === "custom") {
      const itemIndex = projectGalleryItems.findIndex((galleryItem) => projectGalleryItemEntityId(galleryItem) === searchHint.selectedEntityId);
      if (itemIndex >= 0) setLibraryPage(Math.floor(itemIndex / projectPageSize));
    } else if (targetSection === "realmz" || targetSection === "divinity") {
      const itemIndex = matchingLibraryAssets.findIndex((asset) => asset.id === searchHint.selectedEntityId);
      if (itemIndex >= 0) setLibraryPage(Math.floor(itemIndex / libraryPageSize));
    }
  }, [
    allScenarioResources,
    libraryAssets,
    libraryPageSize,
    managedGalleryItems,
    matchingLibraryAssets,
    project,
    project?.assets,
    projectGalleryItems,
    projectPageSize,
    searchHint?.nonce,
    searchHint?.section,
    searchHint?.selectedEntityId,
    section
  ]);
  return (
    <section className="editor-full-panel asset-workbench">
      <PanelHeader
        className="asset-workbench-header"
        headingLevel={1}
        title={(
          <TutorialTip title="Assets Workbench" body={ASSETS_WORKBENCH_HELP} side="below">
            <span>Assets</span>
          </TutorialTip>
        )}
        description="Import, preview, replace, and locate scenario resources."
        actions={<AssetImportBar onImportAssets={section === "custom" || project ? onImportAssets : undefined} compact libraryScope={section === "custom" ? "custom-library" : "scenario"} />}
      />
      <div className="asset-section-tabs" role="tablist" aria-label="Asset sections">
        {PRIMARY_ASSET_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={section === item.id ? "active" : ""}
            onClick={() => setSectionOverride(item.id)}
          >
            <TutorialTip title={item.label} body={assetSectionHelp(item.id)} side="below">
              <span>{item.label}</span>
            </TutorialTip>
          </button>
        ))}
        <details className="asset-technical-menu" open={section === "divinity" || section === "records" || section === "advanced"}>
          <summary>Technical Inventory</summary>
          <div>
            {TECHNICAL_ASSET_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSectionOverride(item.id)}
              >
                <TutorialTip title={item.label} body={assetSectionHelp(item.id)} side="below">
                  <span>{item.label}</span>
                </TutorialTip>
              </button>
            ))}
          </div>
        </details>
      </div>
      {(isManagedAssetSection || isReferenceAssetSection) && (
        <div className="asset-filter-row">
          <SearchField
            className="asset-search-field"
            value={query}
            onChange={setQuery}
            placeholder="Search assets..."
            ariaLabel={section === "project" ? "Search scenario assets" : section === "custom" ? "Search custom library assets" : section === "realmz" ? "Search Realmz Gallery" : "Search technical assets"}
          />
          <TutorialTip title="Asset Kind Filter" body={ASSET_KIND_FILTER_HELP} side="below">
            <select value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value as ManagedAssetKind | "all")} aria-label="Asset kind filter">
              <option value="all">All Types</option>
              {!isReferenceAssetSection && <option value="picture">Pictures</option>}
              <option value="sound">Sounds</option>
              {!isReferenceAssetSection && <option value="music">Music</option>}
              <option value="icon">Icons</option>
              <option value="special-land-tile">Special Land Tiles</option>
              <option value="text">Text Resources</option>
              <option value="other">Other</option>
            </select>
          </TutorialTip>
          {isReferenceAssetSection && <PreviewStatusFilters value={libraryPreviewFilter} counts={libraryPreviewCounts} onChange={setLibraryPreviewFilter} />}
          {section === "divinity" && (
            <label className="asset-inline-toggle" title="Show Divinity/Realmz application interface artwork. These resources are not scenario media.">
              <input type="checkbox" checked={showUiReference} onChange={(event) => setShowUiReference(event.currentTarget.checked)} />
              <TutorialTip title="UI Reference Art" body={UI_REFERENCE_HELP} side="below">
                <span>Show UI Reference</span>
              </TutorialTip>
            </label>
          )}
        </div>
      )}
      <div className="asset-workbench-main" aria-label="Assets workbench">
      {section === "records" && (
        <RecordsPanel project={project} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} />
      )}
      {section !== "advanced" && section !== "records" && (
        <section className="tab-panel asset-authoring-panel">
          <div className="panel-header">
            <TutorialTip title={assetSectionTitle(section)} body={assetSectionHelp(section)} side="below">
              <span>{assetSectionTitle(section)}</span>
            </TutorialTip>
            <b>{isManagedAssetSection ? `${projectGalleryItems.length.toLocaleString()} ${section === "custom" ? "library" : "scenario"} asset${projectGalleryItems.length === 1 ? "" : "s"}` : `${matchingLibraryAssets.length.toLocaleString()} ${section === "realmz" ? "stock" : "technical"} asset${matchingLibraryAssets.length === 1 ? "" : "s"}`}</b>
          </div>
          {kindFilter === "special-land-tile" && (
            <div className="special-land-explainer">
              <TutorialTip title="Special Land Tiles" body={SPECIAL_LAND_FILTER_HELP} side="below">
                <span>Special Land Tiles</span>
              </TutorialTip>{" "}
              are 32 x 32 <code>cicn</code> resources addressed by negative tile ids. They paint directly onto map cells.
            </div>
          )}
          {authoringGuidance && (
            <div className="asset-authoring-note">
              {authoringGuidance}
            </div>
          )}
          {isManagedAssetSection && kindFilter === "special-land-tile" && (
            <AssetImportBar compact fixedKind="special-land-tile" label="Import Tile" libraryScope={section === "custom" ? "custom-library" : "scenario"} onImportAssets={section === "custom" || project ? onImportAssets : undefined} />
          )}
          {isManagedAssetSection && <div className="asset-subsection-heading">{section === "custom" ? "Built-in and User Custom Assets" : "Ships With This Scenario"}</div>}
          {isManagedAssetSection && (
            <>
              <AssetGalleryControls
                pageSize={assetPageSize}
                previewSize={assetPreviewSize}
                onPageSizeChange={setAssetPageSize}
                onPreviewSizeChange={setAssetPreviewSize}
              />
              <div className="asset-gallery-layout">
                <div className="asset-gallery-column">
                  {projectGalleryItems.length > projectPageSize && (
                    <AssetPagination
                      page={currentProjectPage}
                      pageCount={projectPageCount}
                      pageSize={projectPageSize}
                      total={projectGalleryItems.length}
                      onPageChange={setLibraryPage}
                    />
                  )}
                  <div className={`managed-asset-grid asset-gallery preview-${assetPreviewSize}`} aria-label="Scenario assets">
                    {visibleProjectItems.map((item, index) => item.type === "scenario" ? (
                      <ScenarioResourceAssetCard
                        key={renderListKey("scenario-resource-asset", item.asset.entity, index)}
                        asset={item.asset}
                        project={project}
                        catalog={catalog}
                        desktopRuntime={desktopRuntime}
                        projectDir={projectDir}
                        workspaceDir={workspaceDir}
                        selected={selectedAssetKey === item.asset.entity.id}
                        onSelect={() => setSelectedAsset({ type: "resource", entity: item.asset.entity, consumers: project ? directResourceConsumers(project, item.asset) : [] })}
                      />
                    ) : item.type === "library" ? (
                      <LibraryAssetCard
                        key={renderListKey("built-in-custom-asset", item.asset, index)}
                        asset={item.asset}
                        project={project}
                        desktopRuntime={desktopRuntime}
                        workspaceDir={workspaceDir}
                        compact
                        selected={selectedAssetKey === item.asset.id}
                        onSelectEntity={onSelectEntity}
                        onSelect={(preview) => setSelectedAsset({ type: "library", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [] })}
                        onCopyToScenario={project ? requestReferenceAssetCopy : undefined}
                      />
                    ) : item.asset.kind === "special-land-tile" ? (
                      <SpecialLandAssetCard
                        key={renderListKey("project-special-land", item.asset, index)}
                        asset={item.asset}
                        desktopRuntime={desktopRuntime}
                        projectDir={item.root === "workspace" ? workspaceDir : projectDir}
                        compact
                        selected={selectedAssetKey === item.asset.id}
                        onReplaceAsset={item.root === "project" ? onReplaceAsset : undefined}
                        onDeleteAsset={item.root === "workspace" ? onDeleteCustomAsset : onDeleteAsset}
                        onSelectPaintTile={onSelectPaintTile}
                        libraryActionLabel={section === "custom" ? project && onCopyCustomAssetToScenario ? COPY_TO_SCENARIO_ASSETS_LABEL : undefined : ADD_TO_CUSTOM_LIBRARY_LABEL}
                        onMoveAssetScope={(assetId) => {
                          if (section === "custom") onCopyCustomAssetToScenario?.(assetId);
                          else onAddAssetToCustomLibrary?.(assetId);
                        }}
                        onSelect={(preview) => setSelectedAsset({ type: "managed", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [], assetRoot: item.root })}
                      />
                    ) : (
                      <ManagedAssetCard
                        key={renderListKey("managed-asset", item.asset, index)}
                        asset={item.asset}
                        project={project}
                        desktopRuntime={desktopRuntime}
                        projectDir={item.root === "workspace" ? workspaceDir : projectDir}
                        compact
                        selected={selectedAssetKey === item.asset.id}
                        onReplaceAsset={item.root === "project" ? onReplaceAsset : undefined}
                        onUpdateAsset={item.root === "workspace" ? onUpdateCustomAsset : onUpdateAsset}
                        onDeleteAsset={item.root === "workspace" ? onDeleteCustomAsset : onDeleteAsset}
                        onSelectEntity={onSelectEntity}
                        libraryActionLabel={section === "custom" ? project && onCopyCustomAssetToScenario ? COPY_TO_SCENARIO_ASSETS_LABEL : undefined : ADD_TO_CUSTOM_LIBRARY_LABEL}
                        onMoveAssetScope={(assetId) => {
                          if (section === "custom") onCopyCustomAssetToScenario?.(assetId);
                          else onAddAssetToCustomLibrary?.(assetId);
                        }}
                        onSelect={(preview) => setSelectedAsset({ type: "managed", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [], assetRoot: item.root })}
                      />
                    ))}
                    {(section === "custom" || project) && projectGalleryItems.length === 0 && (
                      <p className="empty-copy compact">{section === "custom" ? "No custom assets match this search. Import reusable media here to add it to the user-managed library." : "No scenario assets in this section yet. Imported assets here are the media Providence will package with this scenario."}</p>
                    )}
                    {!project && section !== "custom" && <p className="empty-copy compact">Open a project to manage scenario assets.</p>}
                  </div>
                </div>
                <AssetSelectionInspector
                  item={selectedAsset}
                  project={project}
                  catalog={catalog}
                  desktopRuntime={desktopRuntime}
                  projectDir={projectDir}
                  workspaceDir={workspaceDir}
                  onOpenDetail={(item) => setPreviewItem(item)}
                  onReplaceAsset={onReplaceAsset}
                  onDeleteAsset={onDeleteAsset}
                  onDeleteCustomAsset={onDeleteCustomAsset}
                  onAddAssetToCustomLibrary={onAddAssetToCustomLibrary}
                  onCopyCustomAssetToScenario={project ? onCopyCustomAssetToScenario : undefined}
                  onCopyReferenceAssetToScenario={project ? requestReferenceAssetCopy : undefined}
                  onRemoveScenarioResource={(entity) => {
                    if (!onApplyCommand) return;
                    const targetBaseIconId = numberSummary(entity.summary.monsterIconTargetBaseId);
                    if (targetBaseIconId !== null) {
                      onApplyCommand({
                        kind: "deleteMonsterIconOverride",
                        label: `Remove monster icon set ${targetBaseIconId} from Scenario Assets`,
                        targetBaseIconId
                      });
                    } else {
                      const resourceType = resourceTypeFromSummary(entity.summary);
                      const resourceId = resourceIdFromSummary(entity.summary);
                      if (resourceType === null || resourceId === null) return;
                      onApplyCommand({ kind: "removeScenarioResource", label: `Remove ${resourceType.trim()} ${resourceId}`, resourceType, resourceId, source: entity.source });
                    }
                    setSelectedAsset(null);
                  }}
                  onSelectEntity={onSelectEntity}
                />
              </div>
            </>
          )}
          {!isManagedAssetSection && (
            <>
              <div className="asset-subsection-heading">{assetSectionTitle(section)}</div>
              <AssetGalleryControls
                pageSize={assetPageSize}
                previewSize={assetPreviewSize}
                onPageSizeChange={setAssetPageSize}
                onPreviewSizeChange={setAssetPreviewSize}
              />
              <div className="asset-gallery-layout">
                <div className="asset-gallery-column">
                  {matchingLibraryAssets.length > libraryPageSize && (
                    <AssetPagination
                      page={currentLibraryPage}
                      pageCount={libraryPageCount}
                      pageSize={libraryPageSize}
                      total={matchingLibraryAssets.length}
                      onPageChange={setLibraryPage}
                    />
                  )}
                  <div className={`library-asset-strip asset-gallery preview-${assetPreviewSize}`} aria-label="Library assets">
                    {visibleLibraryAssets.map((asset, index) => (
                      <LibraryAssetCard
                        key={renderListKey("library-asset", asset, index)}
                        asset={asset}
                        project={project}
                        desktopRuntime={desktopRuntime}
                        workspaceDir={workspaceDir}
                        compact
                        selected={selectedAssetKey === asset.id}
                        onSelectEntity={onSelectEntity}
                        onSelect={(preview) => setSelectedAsset({ type: "library", asset, preview, usages: project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [] })}
                        onCopyToScenario={project ? requestReferenceAssetCopy : undefined}
                      />
                    ))}
                    {visibleLibraryAssets.length === 0 && libraryAssets.length > 0 && (
                      <p className="empty-copy compact">No {section === "realmz" ? "stock Realmz" : "technical"} assets match this search.</p>
                    )}
                    {libraryAssets.length === 0 && <p className="empty-copy compact">Bundled libraries did not expose media assets.</p>}
                  </div>
                </div>
                <AssetSelectionInspector
                  item={selectedAsset}
                  project={project}
                  catalog={catalog}
                  desktopRuntime={desktopRuntime}
                  projectDir={projectDir}
                  workspaceDir={workspaceDir}
                  onOpenDetail={(item) => setPreviewItem(item)}
                  onCopyReferenceAssetToScenario={project ? requestReferenceAssetCopy : undefined}
                  onSelectEntity={onSelectEntity}
                />
              </div>
            </>
          )}
        </section>
      )}
      {section === "advanced" && (
      <section className="tab-panel resource-browser">
        <div className="panel-header">
          <TutorialTip title="Advanced Resources" body={assetSectionHelp("advanced")} side="below">
            <span>Advanced Resources</span>
          </TutorialTip>
          <b>{resources.length.toLocaleString()}</b>
        </div>
        <div className="resource-type-grid">
          {resourceTypes.map((entity, index) => {
            const members = resourceMembersForType(project, entity.id);
            return (
              <button
                key={renderListKey("resource-type", entity, index)}
                className={advancedTypeId === entity.id ? "active" : ""}
                onClick={() => {
                  setAdvancedTypeId(entity.id);
                  onSelectEntity(selectEntityFromId(entity.id));
                }}
              >
                <strong>{String(entity.summary.type ?? entity.label)}</strong>
                <span>{members.length.toLocaleString()} resources</span>
                <small>{String(entity.summary.totalBytes ?? 0)} bytes</small>
              </button>
            );
          })}
        </div>
        {gaps.length > 0 && (
          <ScrollArea className="lint-results compact" aria-label="Resource Fallbacks">
            <section>
              <header>
                <TutorialTip title="Resource Fallbacks" body={RESOURCE_FALLBACK_HELP} side="below">
                  <span>Resource Fallbacks</span>
                </TutorialTip>
              </header>
              <IssueList
                issues={gaps.slice(0, 8).map((gap, index) => ({
                  id: renderListKey("resource-gap", gap.entity, index),
                  severity: "warning" as const,
                  message: `${gap.entity.label} uses ${gap.reason}`,
                  detail: `${gap.consumers.length.toLocaleString()} semantic consumers`,
                  onSelect: () => onSelectEntity(selectEntityFromId(gap.entity.id))
                }))}
              />
            </section>
          </ScrollArea>
        )}
        {selectedAdvancedType && (
          <button type="button" className="btn btn-secondary btn-xs advanced-back-button" onClick={() => setAdvancedTypeId(null)}>
            Show all resource types
          </button>
        )}
        <ScrollArea className="resource-list" aria-label="Resource Fork Inventory">
          {advancedResources.slice(0, 500).map((entity, index) => {
            const consumers = resourceConsumers(project, entity.id);
            return (
              <button
                key={renderListKey("resource-entity", entity, index)}
                onClick={() => {
                  onSelectEntity(selectEntityFromId(entity.id));
                  setPreviewItem({ type: "resource", entity, consumers });
                }}
              >
                <strong>{entity.label}</strong>
                <span>{resourceStatus(entity)} | {consumers.length.toLocaleString()} refs</span>
                <small>{entity.id}</small>
              </button>
            );
          })}
          {!project && <div className="entity-empty">Open a project to inspect resources.</div>}
        </ScrollArea>
      </section>
      )}
      {section === "advanced" && (
      <section className="tab-panel atlas-browser">
        <div className="panel-header">
          <TutorialTip title="Tile Atlases" body={TILE_ATLAS_HELP} side="below">
            <span>Tile Atlases</span>
          </TutorialTip>
          <b>{tileAtlases.length.toLocaleString()}</b>
        </div>
        <ScrollArea className="asset-grid compact" aria-label="Tile Atlases">
          {tileAtlases.map((asset, index) => (
            <article key={renderListKey("tile-atlas", asset, index)} className="asset-card">
              <div className="asset-swatch" style={{ background: tileColor(numberSummary(asset.summary.landlook)) }}>
                <span>{asset.editState === "blocked" ? "missing" : "ready"}</span>
              </div>
              <strong>{asset.label}</strong>
              <span>{semanticLabel(project, asset.id)}</span>
              <small>{asset.source}{asset.summary.pictId ? ` | PICT ${asset.summary.pictId}` : ""}</small>
              {asset.summary.imagePath != null && <small>{compactValue(asset.summary.imagePath)}</small>}
            </article>
          ))}
        </ScrollArea>
      </section>
      )}
      </div>
      {previewItem && (
        <ResourcePreviewWindow
          item={previewItem}
          project={project}
          catalog={catalog}
          desktopRuntime={desktopRuntime}
          projectDir={projectDir}
          workspaceDir={workspaceDir}
          onClose={() => setPreviewItem(null)}
          onSelectEntity={onSelectEntity}
        />
      )}
      {referenceUseAsset && (
        <ReferenceIconUseDialog
          asset={referenceUseAsset}
          catalog={catalog}
          busy={referenceUseBusy}
          error={referenceUseError}
          libraryAvailable={Boolean(onUpdateLibraryCatalog)}
          scenarioAvailable={Boolean(project && onApplyCommand)}
          onChoose={(use) => void applyReferenceIconUse(use)}
          onClose={() => {
            if (referenceUseBusy) return;
            setReferenceUseAsset(null);
            setReferenceUseError("");
          }}
        />
      )}
    </section>
  );
}

function ReferenceIconUseDialog({
  asset,
  catalog,
  busy,
  error,
  libraryAvailable,
  scenarioAvailable,
  onChoose,
  onClose
}: {
  asset: LibraryAsset;
  catalog?: LibraryCatalog | null;
  busy: boolean;
  error: string;
  libraryAvailable: boolean;
  scenarioAvailable: boolean;
  onChoose: (use: ReferenceIconUse) => void;
  onClose: () => void;
}) {
  const pair = findReferenceMonsterIconPair(catalog, asset);
  const sourceText = `${asset.source} ${asset.relativePath}`.toLowerCase();
  const itemLibraryAsset = sourceText.includes("vault of arcana") || sourceText.includes("bag of holding");
  const choices: Array<{ use: ReferenceIconUse; title: string; detail: string; disabled?: boolean; recommended?: boolean }> = [
    {
      use: "scenario-item-icon",
      title: "Scenario Item Icon",
      detail: referenceIconUseDescription("scenario-item-icon"),
      recommended: itemLibraryAsset
    },
    {
      use: "item-icon-library",
      title: "Reusable Item Library",
      detail: referenceIconUseDescription("item-icon-library"),
      disabled: !libraryAvailable
    },
    {
      use: "scenario-monster-icon",
      title: "Scenario Monster Icon Set",
      detail: pair
        ? `Copy both facing resources into Scenario Assets as cicn ${Math.abs(pair.base.resourceId)} and ${Math.abs(pair.paired.resourceId)}.`
        : "Unavailable for this resource. Monster art needs a matched base and paired-facing cicn.",
      disabled: !scenarioAvailable || !pair
    },
    {
      use: "special-land-tile",
      title: "Special Land Tile",
      detail: referenceIconUseDescription("special-land-tile")
    },
    {
      use: "scenario-icon",
      title: "Other Scenario Icon",
      detail: referenceIconUseDescription("scenario-icon")
    }
  ];
  return (
    <ModalDialog
      ariaLabelledBy="reference-icon-use-title"
      className="reference-icon-use-dialog"
      dismissDisabled={busy}
      onDismiss={onClose}
    >
      <ModalDialogHeader
        title="Choose Icon Use"
        titleId="reference-icon-use-title"
        description="The intended consumer determines where Providence stores the cicn and which ID rules apply."
        actions={<button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={onClose}>Close</button>}
      />
      <div className="reference-icon-use-source">
        <strong>{asset.label}</strong>
        <span>cicn {asset.resourceId}</span>
        <small>{asset.source}</small>
      </div>
      <div className="reference-icon-use-options">
        {choices.map((choice) => (
          <button
            key={choice.use}
            type="button"
            className="reference-icon-use-option"
            disabled={busy || choice.disabled}
            onClick={() => onChoose(choice.use)}
          >
            <span>
              <strong>{choice.title}</strong>
              {choice.recommended && <b>Recommended</b>}
            </span>
            <small>{choice.detail}</small>
          </button>
        ))}
      </div>
      {error && <p className="reference-icon-use-error" role="alert">{error}</p>}
      <ModalDialogActions>
        <span>{busy ? "Loading built-in asset data..." : "Scenario choices copy into the current project; library choices remain reusable across projects."}</span>
      </ModalDialogActions>
    </ModalDialog>
  );
}

export function AssetGalleryControls({
  pageSize,
  previewSize,
  onPageSizeChange,
  onPreviewSizeChange
}: {
  pageSize: number;
  previewSize: AssetPreviewSize;
  onPageSizeChange: (pageSize: number) => void;
  onPreviewSizeChange: (previewSize: AssetPreviewSize) => void;
}) {
  return (
    <div className="asset-gallery-controls" aria-label="Asset gallery controls">
      <div className="asset-preview-size-control">
        <span>Preview Size</span>
        <SegmentedControl
          ariaLabel="Asset preview size"
          value={previewSize}
          options={ASSET_PREVIEW_SIZE_OPTIONS}
          onChange={onPreviewSizeChange}
        />
      </div>
      <label>
        <span>Per Page</span>
        <select aria-label="Assets per page" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.currentTarget.value))}>
          {ASSET_PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option === 0 ? "All" : option}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AssetSelectionInspector({
  item,
  project,
  catalog,
  desktopRuntime,
  projectDir,
  workspaceDir,
  onOpenDetail,
  onReplaceAsset,
  onDeleteAsset,
  onDeleteCustomAsset,
  onAddAssetToCustomLibrary,
  onCopyCustomAssetToScenario,
  onRemoveScenarioResource,
  onCopyReferenceAssetToScenario,
  onSelectEntity
}: {
  item: ResourcePreviewItem | null;
  project: Project | null;
  catalog?: LibraryCatalog | null;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onOpenDetail: (item: ResourcePreviewItem) => void;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onDeleteAsset?: (assetId: string) => void;
  onDeleteCustomAsset?: (assetId: string) => void;
  onAddAssetToCustomLibrary?: (assetId: string) => void;
  onCopyCustomAssetToScenario?: (assetId: string) => void;
  onRemoveScenarioResource?: (entity: SemanticEntity) => void;
  onCopyReferenceAssetToScenario?: (assetId: string) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const title = item ? resourcePreviewItemTitle(item) : "No Asset Selected";
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const showCopyReferenceAction = item?.type === "library" && Boolean(onCopyReferenceAssetToScenario && canCopyLibraryAssetToScenario(item.asset));
  const managedRoot = item?.type === "managed" ? item.assetRoot ?? "project" : null;
  const showCopyCustomAction = item?.type === "managed" && item.asset.libraryScope === "custom-library" && Boolean(onCopyCustomAssetToScenario);
  const showAddCustomAction = item?.type === "managed" && item.asset.libraryScope !== "custom-library" && Boolean(onAddAssetToCustomLibrary);
  const showReplaceAction = item?.type === "managed" && managedRoot === "project" && Boolean(onReplaceAsset);
  const showDeleteManagedAction = item?.type === "managed" && Boolean(managedRoot === "workspace" ? onDeleteCustomAsset : onDeleteAsset);
  const resourceType = item?.type === "resource" ? resourceTypeFromSummary(item.entity.summary) : null;
  const resourceId = item?.type === "resource" ? resourceIdFromSummary(item.entity.summary) : null;
  const showRemoveResourceAction = item?.type === "resource" && resourceType !== null && resourceId !== null && Boolean(onRemoveScenarioResource);
  const deleteManaged = () => {
    if (item?.type !== "managed") return;
    if (!window.confirm(`Delete ${item.asset.label}? Records that still use ${item.asset.resourceType.trim()} ${item.asset.resourceId} may become missing.`)) return;
    if (managedRoot === "workspace") onDeleteCustomAsset?.(item.asset.id);
    else onDeleteAsset?.(item.asset.id);
  };
  return (
    <aside className="asset-selection-inspector" aria-label="Selected asset inspector">
      <header>
        <div>
          <span>Selection Inspector</span>
          <strong>{title}</strong>
        </div>
        <div className="panel-header-actions">
          {showCopyReferenceAction && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => item?.type === "library" && onCopyReferenceAssetToScenario?.(item.asset.id)}>
              {item?.type === "library" ? referenceAssetCopyLabel(item.asset) : COPY_TO_SCENARIO_ASSETS_LABEL}
            </button>
          )}
          {showCopyCustomAction && item?.type === "managed" && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onCopyCustomAssetToScenario?.(item.asset.id)}>
              {COPY_TO_SCENARIO_ASSETS_LABEL}
            </button>
          )}
          {showAddCustomAction && item?.type === "managed" && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onAddAssetToCustomLibrary?.(item.asset.id)}>
              {ADD_TO_CUSTOM_LIBRARY_LABEL}
            </button>
          )}
          {showReplaceAction && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => replaceInputRef.current?.click()}>Replace</button>
          )}
          {showDeleteManagedAction && (
            <button type="button" className="btn btn-danger btn-xs" onClick={deleteManaged}>Delete</button>
          )}
          {showRemoveResourceAction && item?.type === "resource" && resourceType !== null && resourceId !== null && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => {
                const monsterIconTargetBaseId = numberSummary(item.entity.summary.monsterIconTargetBaseId);
                const prompt = monsterIconTargetBaseId !== null
                  ? `Remove the paired monster icon set ${monsterIconTargetBaseId}/${monsterIconTargetBaseId + 308} from this scenario?`
                  : `Remove ${resourceType.trim()} ${resourceId} from this scenario export? Existing references may become missing.`;
                if (!window.confirm(prompt)) return;
                onRemoveScenarioResource?.(item.entity);
              }}
            >
              {numberSummary(item.entity.summary.monsterIconTargetBaseId) !== null ? "Remove Icon Set" : "Remove from Scenario"}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-xs" disabled={!item} onClick={() => item && onOpenDetail(item)}>
            Open Detail
          </button>
        </div>
      </header>
      {item ? (
        <ResourcePreviewContents item={item} project={project} catalog={catalog} desktopRuntime={desktopRuntime} projectDir={projectDir} workspaceDir={workspaceDir} onSelectEntity={onSelectEntity} />
      ) : (
        <p className="empty-copy compact">Select an asset to inspect preview scale, source, export scope, decoded metadata, and usage links.</p>
      )}
      <input
        ref={replaceInputRef}
        type="file"
        accept={item?.type === "managed" && item.asset.kind === "sound" ? "audio/*" : item?.type === "managed" && item.asset.kind === "music" ? ".mod,audio/x-mod" : "image/*"}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          if (file && item?.type === "managed") onReplaceAsset?.(item.asset.id, file);
          event.currentTarget.value = "";
        }}
      />
    </aside>
  );
}

function effectiveAssetPageSize(pageSize: number, total: number) {
  if (pageSize <= 0) return Math.max(1, total);
  return pageSize;
}

function resourcePreviewItemKey(item: ResourcePreviewItem) {
  if (item.type === "managed") return item.asset.id;
  if (item.type === "library") return item.asset.id;
  return item.entity.id;
}

function resourcePreviewItemTitle(item: ResourcePreviewItem) {
  if (item.type === "managed") return item.asset.label;
  if (item.type === "library") return item.asset.label;
  return item.entity.label;
}

function projectGalleryItemEntityId(item: ProjectGalleryItem) {
  return item.type === "scenario" ? item.asset.entity.id : item.asset.id;
}

function previewItemForEntityId(
  entityId: string,
  project: Project | null,
  managedItems: ManagedGalleryItem[],
  scenarioResources: ScenarioResourceAsset[],
  libraryAssets: LibraryAsset[],
  section: AssetSection
): ResourcePreviewItem | null {
  const managed = managedItems.find((item) => item.asset.id === entityId);
  if (managed) {
    return {
      type: "managed",
      asset: managed.asset,
      preview: null,
      usages: project ? resourceUsageLinks(project, managed.asset.resourceType, managed.asset.resourceId) : [],
      assetRoot: managed.root
    };
  }
  const scenarioResource = scenarioResources.find((asset) => asset.entity.id === entityId);
  if (scenarioResource) {
    return {
      type: "resource",
      entity: scenarioResource.entity,
      consumers: project ? directResourceConsumers(project, scenarioResource) : []
    };
  }
  const libraryAsset = libraryAssets.find((asset) => asset.id === entityId);
  if (libraryAsset && (section === "custom" || section === "realmz" || section === "divinity")) {
    return {
      type: "library",
      asset: libraryAsset,
      preview: {
        dataUrl: null,
        status: estimatedPreviewStatus(libraryAsset),
        summary: {},
        diagnostics: []
      },
      usages: project ? resourceUsageLinks(project, libraryAsset.resourceType, libraryAsset.resourceId) : []
    };
  }
  return null;
}

type ScenarioResourceAsset = {
  entity: SemanticEntity;
  kind: ManagedAssetKind;
  resourceType: string;
  resourceId: number;
  source: string;
  bytes: number;
  previewPath: string;
};

function ScenarioResourceAssetCard({
  asset,
  project,
  catalog,
  desktopRuntime,
  projectDir,
  workspaceDir,
  selected,
  onSelect
}: {
  asset: ScenarioResourceAsset;
  project: Project | null;
  catalog?: LibraryCatalog | null;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { previewRef, preview } = useScenarioResourcePreview<HTMLElement>(project, catalog, asset, desktopRuntime, projectDir, workspaceDir, selected);
  return (
    <article
      ref={previewRef}
      className={`managed-asset-card scenario-resource compact-gallery-card${selected ? " selected" : ""}`}
      tabIndex={0}
      data-asset-scope="scenario-resource"
      data-asset-kind={asset.kind}
      data-resource-type={asset.resourceType}
      data-resource-id={asset.resourceId}
      onClick={onSelect}
      onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    }}
    >
      <AssetPreview
        kind={asset.kind}
        label={asset.entity.label}
        preview={preview}
        status={scenarioResourcePreviewStatus(asset.entity)}
        diagnostics={scenarioResourcePreviewDiagnostics(asset.entity)}
        onOpen={onSelect}
      />
      <strong>{asset.entity.label}</strong>
      <small>{asset.resourceType} {asset.resourceId}</small>
      {scenarioPictureOverrideWarning(asset.resourceType, asset.resourceId) && <small className="asset-card-warning">Runtime override ID</small>}
    </article>
  );
}

function useScenarioResourcePreview<T extends HTMLElement>(
  project: Project | null,
  catalog: LibraryCatalog | null | undefined,
  asset: ScenarioResourceAsset,
  desktopRuntime: boolean,
  projectDir: string,
  workspaceDir: string,
  selected: boolean
) {
  const previewLoadOverride = asset.kind === "sound" ? selected : undefined;
  const { previewRef, preview: projectPreview, previewEnabled } = useDeferredProjectPreview<T>(
    asset.previewPath,
    desktopRuntime,
    projectDir,
    "",
    previewLoadOverride
  );
  const referencePictureId = referencePictureIdFromPath(asset.previewPath);
  const referencePictureAsset = useMemo(() => {
    if (referencePictureId == null) return null;
    return catalog?.assets.find((candidate) =>
      candidate.resourceType === "PICT" &&
      candidate.resourceId === referencePictureId &&
      `${candidate.source} ${candidate.relativePath}`.toLowerCase().includes("realmz")
    ) ?? null;
  }, [catalog, referencePictureId]);
  const referencePicturePreview = useResolvedPreviewUrl(
    referencePictureId != null ? null : undefined,
    null,
    referencePictureAsset,
    { desktopRuntime, projectDir, workspaceDir, project, resourceType: "PICT", resourceId: referencePictureId }
  );
  const [browserPreview, setBrowserPreview] = useState<string | null>(null);
  const browserPreviewEnabled = asset.kind === "sound" ? selected : previewEnabled;
  useEffect(() => {
    if (!browserPreviewEnabled || referencePicturePreview || projectPreview || asset.previewPath) return;
    setBrowserPreview(loadBrowserScenarioResourcePreview(project, asset.resourceType, asset.resourceId));
  }, [asset.previewPath, asset.resourceId, asset.resourceType, browserPreviewEnabled, project, projectPreview, referencePicturePreview]);
  return { previewRef, preview: referencePicturePreview ?? projectPreview ?? browserPreview };
}

function scenarioResourceAssets(project: Project | null): ScenarioResourceAsset[] {
  if (!project) return [];
  const assets: ScenarioResourceAsset[] = [];
  const seen = new Set<string>();
  const removed = new Set((project.editorMetadata?.removedScenarioResources ?? []).map((resource) => `${resource.resourceType}:${resource.resourceId}`));
  const managedResourceKeys = new Set((project.assets ?? [])
    .filter((asset) => asset.libraryScope !== "custom-library")
    .map((asset) => `${asset.resourceType.trim()}:${asset.resourceId}`));
  const addResource = (resourceType: string, resourceId: number, label: string, source: string, previewPath?: string | null, extraSummary: Record<string, unknown> = {}) => {
    if (!isScenarioResourceSource(source)) return;
    if (removed.has(`${resourceType}:${resourceId}`)) return;
    const key = `${resourceType}:${resourceId}:${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    const resolvedPreviewPath = previewPath ?? scenarioResourcePreviewPath(project, resourceType, resourceId);
    const entity = directResourceEntity(resourceType, resourceId, label, source, resolvedPreviewPath, extraSummary);
    assets.push({
      entity,
      kind: managedKindForResource(resourceType),
      resourceType,
      resourceId,
      source,
      bytes: typeof entity.summary.bytes === "number" ? entity.summary.bytes : 0,
      previewPath: resolvedPreviewPath
    });
  };
  for (const picture of project.assetCatalog.pictures ?? []) {
    addResource(picture.resourceType, picture.resourceId, picture.name || `${picture.resourceType} ${picture.resourceId}`, picture.source, picture.previewPath);
  }
  for (const icon of project.assetCatalog.icons ?? []) {
    addResource(icon.resourceType, icon.resourceId, icon.name || `${icon.resourceType} ${icon.resourceId}`, icon.source, icon.previewPath);
  }
  for (const sound of project.assetCatalog.sounds ?? []) {
    addResource(sound.resourceType, sound.resourceId, sound.name || `${sound.resourceType} ${sound.resourceId}`, sound.source, sound.previewPath);
  }
  for (const override of project.monsterIconOverrides ?? []) {
    const baseId = Math.abs(override.targetBaseIconId);
    const pairedId = baseId + 308;
    const label = override.sourceLabel?.trim() || `Monster Icon ${baseId}`;
    const source = `Scenario resource: monster icon override ${baseId}`;
    const addOverrideResource = (resourceId: number, facing: "Base" | "Alternate", resourceBase64: string) => {
      if (assets.some((asset) => asset.resourceType === "cicn" && Math.abs(asset.resourceId) === resourceId)) return;
      addResource("cicn", resourceId, `${label} - ${facing}`, source, resourcePreviewDataUrlFromBase64("cicn", resourceBase64), {
        family: "monster-icon-override",
        monsterIconTargetBaseId: baseId,
        facing: facing.toLowerCase(),
        bytes: base64ByteLength(resourceBase64),
        previewStatus: "preview-ready"
      });
    };
    addOverrideResource(baseId, "Base", override.sourceBaseResourceBase64);
    addOverrideResource(pairedId, "Alternate", override.sourcePairedResourceBase64);
  }
  for (const tileset of project.assetCatalog.tilesets ?? []) {
    if (tileset.pictId == null) continue;
    addResource("PICT", tileset.pictId, tileset.name, tileset.source, tileset.imagePath, {
      family: "tile-atlas",
      landlook: tileset.landlook,
      previewStatus: tileset.available ? "preview-ready" : "missing-fallback"
    });
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    const resourceType = resourceTypeFromSummary(entity.summary);
    if (resourceType !== "TEXT" && resourceType !== "STR#" && resourceType !== "styl") continue;
    const resourceId = resourceIdFromSummary(entity.summary);
    if (resourceId == null) continue;
    if (managedResourceKeys.has(`${resourceType}:${resourceId}`)) continue;
    const summary = textResourceSummaryFromSemanticEntity(entity);
    const previewPath = typeof summary.previewDataUrl === "string" ? summary.previewDataUrl : "";
    addResource(resourceType, resourceId, entity.label || `${resourceType} ${resourceId}`, entity.source, previewPath, summary);
  }
  return assets.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.resourceId - b.resourceId || a.source.localeCompare(b.source));
}

function base64ByteLength(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(normalized.length * 3 / 4) - padding);
}

function isScenarioResourceSource(source: string) {
  const normalized = source.toLowerCase();
  return normalized.includes("scenario resource") || normalized.includes("scenario.rsrc");
}

function textResourceSummaryFromSemanticEntity(entity: SemanticEntity) {
  const summary: Record<string, unknown> = {
    ...entity.summary,
    bytes: numberSummary(entity.summary.bytes) ?? numberSummary(entity.summary.textBytes) ?? numberSummary(entity.summary.styleBytes) ?? 0
  };
  const resourceType = resourceTypeFromSummary(summary);
  if ((resourceType === "TEXT" || resourceType === "STR#") && typeof summary.previewDataUrl !== "string") {
    const text = importedTextResourceBody(summary);
    if (text) summary.previewDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  }
  return summary;
}

function importedTextResourceBody(summary: Record<string, unknown>) {
  if (typeof summary.text === "string") return summary.text;
  if (typeof summary.textPreview === "string") return summary.textPreview;
  if (typeof summary.preview === "string") return summary.preview;
  return "";
}

function directResourceEntity(resourceType: string, resourceId: number, label: string, source: string, previewPath?: string | null, summary: Record<string, unknown> = {}): SemanticEntity {
  const previewStatus = summary.previewStatus ?? initialScenarioPreviewStatus(resourceType, previewPath);
  return {
    id: `resource:${resourceType}:${resourceId}`,
    type: resourceEntityType(resourceType),
    label,
    editState: "inspect-only",
    confidence: "source-backed",
    source,
    recordRef: null,
    byteRange: null,
    editable: false,
    summary: {
      type: resourceType,
      resourceType,
      resourceId,
      scenarioSupplied: true,
      previewDataUrl: previewPath ?? "",
      previewStatus,
      authoringWarning: scenarioPictureOverrideWarning(resourceType, resourceId),
      ...summary
    }
  };
}

function scenarioPictureOverrideWarning(resourceType: string, resourceId: number) {
  if (resourceType !== "PICT" || resourceId === SCENARIO_SPLASH_PICTURE_ID || (resourceId >= SCENARIO_PICTURE_MIN_ID && resourceId <= SCENARIO_PICTURE_MAX_ID)) return "";
  return "This PICT ID is outside normal scenario picture ranges and may override Realmz interface, landlook, or runtime art. Keep it only when that override is intentional; do not select it as an ordinary Display Picture target.";
}

function initialScenarioPreviewStatus(resourceType: string, previewPath?: string | null): ResourcePreviewStatus {
  if (previewPath) return "preview-ready";
  const normalized = resourceType.trim();
  if (normalized === "PICT" || normalized === "cicn") return "preview-ready";
  if (normalized === "snd") return "playable";
  if (normalized === "TEXT" || normalized === "STR#") return "text-ready";
  return "metadata-only";
}

function referencePictureIdFromPath(path: string) {
  const match = path.match(/^reference-picture:(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) ? id : null;
}

function resourceEntityType(resourceType: string) {
  const normalized = resourceType.trim();
  if (normalized === "PICT") return "picture";
  if (normalized === "cicn") return "icon-resource";
  if (normalized === "snd") return "sound";
  if (normalized === "TEXT") return "text-resource";
  if (normalized === "STR#") return "string-list-resource";
  if (normalized === "styl") return "style-resource";
  return "resource";
}

function directResourceConsumers(project: Project, asset: ScenarioResourceAsset) {
  return resourceUsageLinks(project, asset.resourceType, asset.resourceId).map((usage, index) => ({
    id: `direct-resource:${asset.resourceType}:${asset.resourceId}:${usage.key}:${index}`,
    from: usage.entity?.id ?? usage.key,
    to: asset.entity.id,
    kind: usage.detail,
    confidence: "source-backed",
    evidence: [usage.label],
    metadata: { label: usage.label, detail: usage.detail, direct: true }
  }));
}

function resourceTypeFromSummary(summary: Record<string, unknown>) {
  const value = typeof summary.resourceType === "string" ? summary.resourceType : typeof summary.type === "string" ? summary.type : "";
  return value.trim() ? value : null;
}

function resourceIdFromSummary(summary: Record<string, unknown>) {
  const value = typeof summary.resourceId === "number" ? summary.resourceId : typeof summary.resourceId === "string" ? Number(summary.resourceId) : NaN;
  return Number.isFinite(value) ? value : null;
}

function managedKindForResource(resourceType: string): ManagedAssetKind {
  const normalized = resourceType.trim();
  if (normalized === "PICT") return "picture";
  if (normalized === "cicn") return "icon";
  if (normalized === "snd") return "sound";
  if (normalized === "TEXT" || normalized === "STR#" || normalized === "styl") return "text";
  return "other";
}

function scenarioResourcePreviewStatus(entity: SemanticEntity): ResourcePreviewStatus | "unknown" {
  return typeof entity.summary.previewStatus === "string" ? entity.summary.previewStatus as ResourcePreviewStatus : "unknown";
}

function scenarioResourcePreviewDiagnostics(entity: SemanticEntity) {
  const diagnostics = Array.isArray(entity.summary.previewDiagnostics) ? entity.summary.previewDiagnostics : [];
  return diagnostics
    .filter((entry): entry is string | ResourcePreviewDiagnostic =>
      (typeof entry === "string" && entry.trim().length > 0) ||
      isResourcePreviewDiagnostic(entry)
    )
    .map((entry) => typeof entry === "string"
      ? { severity: "warning", code: "resource.preview", message: entry, decoder: "resource-preview" }
      : entry);
}

function isResourcePreviewDiagnostic(entry: unknown): entry is ResourcePreviewDiagnostic {
  return typeof entry === "object" &&
    entry !== null &&
    "message" in entry &&
    "code" in entry &&
    "decoder" in entry &&
    typeof entry.message === "string" &&
    entry.message.trim().length > 0 &&
    typeof entry.code === "string" &&
    typeof entry.decoder === "string";
}

function scenarioResourcePreviewPath(project: Project, resourceType: string, resourceId: number) {
  if (resourceType === "PICT") {
    return project.assetCatalog.pictures?.find((asset) => asset.resourceId === resourceId)?.previewPath ??
      project.assetCatalog.tilesets.find((asset) => asset.pictId === resourceId)?.imagePath ??
      browserReferenceAtlasToken(resourceId) ??
      "";
  }
  if (resourceType === "cicn") {
    return project.assetCatalog.icons?.find((asset) => asset.resourceId === resourceId)?.previewPath ?? "";
  }
  if (resourceType.trim() === "snd") {
    return project.assetCatalog.sounds?.find((asset) => soundResourceIdMatches(asset.resourceId, resourceId))?.previewPath ?? "";
  }
  return "";
}

function assetSearchText(label: string, resourceType: string | null | undefined, resourceId: number | null | undefined, extra = "") {
  const type = (resourceType ?? "").trim();
  const parts = [label, type, resourceId ?? "", extra];
  if (type === "snd" && typeof resourceId === "number" && resourceId !== 0) {
    parts.push(`${type} ${Math.abs(resourceId)}`, `${type} ${-Math.abs(resourceId)}`, `sound ${Math.abs(resourceId)}`, `sound ${-Math.abs(resourceId)}`);
  }
  return parts.join(" ").toLowerCase();
}

function soundResourceIdMatches(availableId: number, requestedId: number) {
  return availableId === requestedId || Math.abs(availableId) === Math.abs(requestedId);
}

function referenceIconOrigin(asset: LibraryAsset) {
  const sourceText = `${asset.source} ${asset.relativePath}`.toLowerCase();
  if (sourceText.includes("vault of arcana")) {
    return { kind: "vault-of-arcana" as const, sourceId: asset.id, sourceLabel: asset.label };
  }
  return { kind: "external-resource" as const, sourceId: asset.id, sourceLabel: asset.label };
}

function monsterPairLabel(label: string) {
  return label.replace(/\s+(base|left|right|paired|facing)\b.*$/i, "").trim() || label;
}
