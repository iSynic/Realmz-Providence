import { useEffect, useMemo, useState } from "react";
import { AssetSearchHint, LibraryAsset, LibraryCatalog, ManagedAsset, ManagedAssetKind, ManagedAssetLibraryScope, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { browserReferenceAtlasToken } from "../browser/atlasPaths";
import { loadBrowserScenarioResourcePreview } from "../browser/project";
import { useResolvedPreviewUrl } from "../previewUrls";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { resourceUsageLinks } from "../contentLinks";
import { canCopyLibraryAssetToScenario } from "../resourceResolver";
import { tileColor } from "../components/TileSprite";
import { PanelHeader, ScrollArea, SearchField, SegmentedControl } from "../ui";
import { renderListKey } from "../renderKeys";
import { MediaAssetImportOptions } from "../mediaAssets";
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
import { ADD_TO_CUSTOM_LIBRARY_LABEL, COPY_TO_SCENARIO_ASSETS_LABEL, MOVE_TO_SCENARIO_ASSETS_LABEL, type AssetSection, assetSectionHelp } from "./resources/assetOwnership";

type AssetPreviewSize = "small" | "medium" | "large";
type ManagedGalleryItem = { type: "managed"; asset: ManagedAsset; root: "project" | "workspace" };
type ProjectGalleryItem =
  | { type: "scenario"; asset: ScenarioResourceAsset }
  | ManagedGalleryItem;

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
  onCopyReferenceAssetToScenario?: (assetId: string) => void;
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
  const normalizedQuery = query.trim().toLowerCase();
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
  const projectGalleryItems = useMemo<ProjectGalleryItem[]>(() => [
    ...scenarioResources.map((asset) => ({ type: "scenario" as const, asset })),
    ...managedGalleryItems
  ], [managedGalleryItems, scenarioResources]);
  const isManagedAssetSection = section === "project" || section === "custom";
  const isReferenceAssetSection = section === "realmz" || section === "divinity";
  useEffect(() => {
    setLibraryPage(0);
  }, [section, kindFilter, normalizedQuery, libraryPreviewFilter, showUiReference, assetPageSize]);
  useEffect(() => {
    setSelectedAsset(null);
  }, [section]);
  const matchingLibraryAssets = useMemo(() => libraryAssets
    .filter((asset) => {
      if (!libraryAssetMatchesSection(asset, section, showUiReference)) return false;
      if (!libraryAssetMatchesKind(asset, kindFilter)) return false;
      if (normalizedQuery && !assetSearchText(asset.label, asset.resourceType ?? "", asset.resourceId ?? null, asset.relativePath).includes(normalizedQuery)) return false;
      if (libraryPreviewFilter === "all") return true;
      return estimatedPreviewStatus(asset) === libraryPreviewFilter;
    }), [kindFilter, libraryAssets, libraryPreviewFilter, normalizedQuery, section, showUiReference]);
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
            ariaLabel={section === "project" ? "Search scenario assets" : section === "custom" ? "Search custom library assets" : "Search reference assets"}
            resultCount={isManagedAssetSection ? projectGalleryItems.length : matchingLibraryAssets.length}
            resultNoun="asset"
          />
          <TutorialTip title="Asset Kind Filter" body={ASSET_KIND_FILTER_HELP} side="below">
            <select value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value as ManagedAssetKind | "all")} aria-label="Asset kind filter">
              <option value="all">All Types</option>
              <option value="picture">Pictures</option>
              <option value="sound">Sounds</option>
              <option value="icon">Icons</option>
              <option value="special-land-tile">Special Land Tiles</option>
              <option value="text">Text Resources</option>
              <option value="other">Other</option>
            </select>
          </TutorialTip>
          {isReferenceAssetSection && <PreviewStatusFilters value={libraryPreviewFilter} onChange={setLibraryPreviewFilter} />}
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
            <b>{isManagedAssetSection ? `${projectGalleryItems.length.toLocaleString()} ${section === "custom" ? "library" : "scenario"} asset${projectGalleryItems.length === 1 ? "" : "s"}` : `${matchingLibraryAssets.length.toLocaleString()} reference asset${matchingLibraryAssets.length === 1 ? "" : "s"}`}</b>
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
          {isManagedAssetSection && <div className="asset-subsection-heading">{section === "custom" ? "Providence Custom Library" : "Ships With This Scenario"}</div>}
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
                        libraryActionLabel={item.root === "workspace" ? project && onCopyCustomAssetToScenario ? COPY_TO_SCENARIO_ASSETS_LABEL : undefined : section === "custom" ? MOVE_TO_SCENARIO_ASSETS_LABEL : ADD_TO_CUSTOM_LIBRARY_LABEL}
                        onMoveAssetScope={(assetId) => {
                          if (item.root === "workspace") onCopyCustomAssetToScenario?.(assetId);
                          else if (section === "custom") onUpdateAsset?.(assetId, { libraryScope: "scenario" });
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
                        libraryActionLabel={item.root === "workspace" ? project && onCopyCustomAssetToScenario ? COPY_TO_SCENARIO_ASSETS_LABEL : undefined : section === "custom" ? MOVE_TO_SCENARIO_ASSETS_LABEL : ADD_TO_CUSTOM_LIBRARY_LABEL}
                        onMoveAssetScope={(assetId) => {
                          if (item.root === "workspace") onCopyCustomAssetToScenario?.(assetId);
                          else if (section === "custom") onUpdateAsset?.(assetId, { libraryScope: "scenario" });
                          else onAddAssetToCustomLibrary?.(assetId);
                        }}
                        onSelect={(preview) => setSelectedAsset({ type: "managed", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [], assetRoot: item.root })}
                      />
                    ))}
                    {(section === "custom" || project) && projectGalleryItems.length === 0 && (
                      <p className="empty-copy compact">{section === "custom" ? "No custom library assets yet. Import reusable Providence media or add scenario assets here for future scenarios." : "No scenario assets in this section yet. Imported assets here are the media Providence will package with this scenario."}</p>
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
                        onCopyToScenario={project ? onCopyReferenceAssetToScenario : undefined}
                      />
                    ))}
                    {visibleLibraryAssets.length === 0 && libraryAssets.length > 0 && (
                      <p className="empty-copy compact">No reference assets match this search.</p>
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
                  onCopyReferenceAssetToScenario={project ? onCopyReferenceAssetToScenario : undefined}
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
              {gaps.slice(0, 8).map((gap, index) => (
                <button key={renderListKey("resource-gap", gap.entity, index)} className="lint-issue warning" onClick={() => onSelectEntity(selectEntityFromId(gap.entity.id))}>
                  ! {gap.entity.label} uses {gap.reason}
                  <small>{gap.consumers.length.toLocaleString()} semantic consumers</small>
                </button>
              ))}
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
    </section>
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
  onCopyReferenceAssetToScenario?: (assetId: string) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const title = item ? resourcePreviewItemTitle(item) : "No Asset Selected";
  const showCopyReferenceAction = item?.type === "library" && Boolean(onCopyReferenceAssetToScenario && canCopyLibraryAssetToScenario(item.asset));
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
              {COPY_TO_SCENARIO_ASSETS_LABEL}
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
  if (libraryAsset && (section === "realmz" || section === "divinity")) {
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
  const managedResourceKeys = new Set((project.assets ?? [])
    .filter((asset) => asset.libraryScope !== "custom-library")
    .map((asset) => `${asset.resourceType.trim()}:${asset.resourceId}`));
  const addResource = (resourceType: string, resourceId: number, label: string, source: string, previewPath?: string | null, extraSummary: Record<string, unknown> = {}) => {
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
      ...summary
    }
  };
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
