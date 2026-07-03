import { useEffect, useMemo, useState } from "react";
import { AssetSearchHint, LibraryAsset, LibraryCatalog, ManagedAssetKind, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { browserReferenceAtlasToken } from "../browser/atlasPaths";
import { loadBrowserScenarioResourcePreview } from "../browser/project";
import { useResolvedPreviewUrl } from "../previewUrls";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { resourceUsageLinks } from "../contentLinks";
import { tileColor } from "../components/TileSprite";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { MediaAssetImportOptions } from "../mediaAssets";
import { TutorialTip } from "../components/TutorialTip";
import {
  ASSET_SECTIONS,
  AssetImportBar,
  AssetPagination,
  AssetSection,
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

type AssetPreviewSize = "small" | "medium" | "large";
type ProjectGalleryItem =
  | { type: "scenario"; asset: ScenarioResourceAsset }
  | { type: "managed"; asset: Project["assets"][number] };

const ASSET_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 0];

const ASSETS_WORKBENCH_HELP = "Assets shows what media can be previewed, what media the scenario owns, and which records use each resource. A previewable reference asset is not exported unless it is imported or scenario-supplied.";
const ASSET_KIND_FILTER_HELP = "Filter by Realmz resource family. Pictures are PICT resources, sounds are snd resources, icons and special land tiles are cicn resources, and text resources are TEXT or STR# entries.";
const UI_REFERENCE_HELP = "Divinity and Realmz editor interface art is useful for research, but it is not scenario media. Keep it hidden unless you are comparing manual/editor artwork.";
const SPECIAL_LAND_FILTER_HELP = "Special Land Tiles are 32 x 32 cicn resources painted as negative map field values. Realmz draws the landlook base tile under the transparent icon.";
const RESOURCE_FALLBACK_HELP = "Fallback warnings identify records that point at resources Providence could not resolve from the scenario or bundled Realmz libraries. Treat used missing resources as release risks.";
const TILE_ATLAS_HELP = "Tile atlases are landlook render sources. Standard Realmz atlases are reference data; scenario custom landlooks ship only when the scenario supplies them.";

function assetSectionHelp(section: AssetSection) {
  if (section === "project") {
    return "Scenario Assets are project-owned media that Providence can package into the scenario resource fork or companion files. Use this section for authored pictures, sounds, icons, text, and special land tiles.";
  }
  if (section === "realmz") {
    return "Reference Libraries are Realmz built-ins. They can power previews and pickers, but they are read-only and are not copied into your scenario.";
  }
  if (section === "divinity") {
    return "Divinity Reference contains editor/manual evidence and comparison art. These resources are read-only and usually should not appear in normal authoring pickers.";
  }
  if (section === "records") {
    return "Decoded Records shows parsed scenario records rather than media assets. It is useful when tracing which data records refer to a resource.";
  }
  return "Advanced Inventory is the raw resource-fork ledger. It exposes imported PICT, cicn, snd, TEXT, STR#, styl, RLMZ, vers, malformed, and compatibility resources for diagnostics.";
}

export function ResourcesPanel({
  project,
  catalog,
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
  onSelectPaintTile
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  activeEditor?: string;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  searchHint?: AssetSearchHint | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onImportAssets?: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset?: (assetId: string) => void;
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
  const projectAssets = useMemo(() => (project?.assets ?? []).filter((asset) =>
    assetMatchesSection(asset, section) &&
    assetMatchesKind(asset.kind, kindFilter) &&
    (!normalizedQuery || assetSearchText(asset.label, asset.resourceType, asset.resourceId, asset.fileName).includes(normalizedQuery))
  ), [kindFilter, normalizedQuery, project?.assets, section]);
  const allScenarioResources = useMemo(() => scenarioResourceAssets(project), [project]);
  const scenarioResources = useMemo(() => allScenarioResources.filter((asset) =>
    section === "project" &&
    assetMatchesKind(asset.kind, kindFilter) &&
    (!normalizedQuery || assetSearchText(asset.entity.label, asset.resourceType, asset.resourceId, asset.source).includes(normalizedQuery))
  ), [allScenarioResources, kindFilter, normalizedQuery, section]);
  const projectGalleryItems = useMemo<ProjectGalleryItem[]>(() => [
    ...scenarioResources.map((asset) => ({ type: "scenario" as const, asset })),
    ...projectAssets.map((asset) => ({ type: "managed" as const, asset }))
  ], [projectAssets, scenarioResources]);
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
      project?.assets ?? [],
      allScenarioResources,
      libraryAssets,
      searchHint.section ?? section
    );
    if (!item) return;
    setSelectedAsset(item);
    const targetSection = searchHint.section ?? section;
    if (targetSection === "project") {
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
      <header className="asset-workbench-header">
        <div>
          <h1>
            <TutorialTip title="Assets Workbench" body={ASSETS_WORKBENCH_HELP} side="below">
              <span>Assets</span>
            </TutorialTip>
          </h1>
          <p>Manage media that ships with this scenario, and browse bundled reference resources for previews and pickers.</p>
        </div>
        <AssetImportBar onImportAssets={project ? onImportAssets : undefined} compact />
      </header>
      <div className="asset-section-tabs" role="tablist" aria-label="Asset sections">
        {ASSET_SECTIONS.map((item) => (
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
      {section !== "records" && (
        <div className="asset-filter-row">
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search assets..." />
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
          <PreviewStatusFilters value={libraryPreviewFilter} onChange={setLibraryPreviewFilter} />
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
            <b>{section === "project" ? `${(projectAssets.length + scenarioResources.length).toLocaleString()} scenario asset${projectAssets.length + scenarioResources.length === 1 ? "" : "s"}` : `${matchingLibraryAssets.length.toLocaleString()} reference asset${matchingLibraryAssets.length === 1 ? "" : "s"}`}</b>
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
          {section === "project" && kindFilter === "special-land-tile" && (
            <AssetImportBar compact fixedKind="special-land-tile" label="Import Tile" onImportAssets={project ? onImportAssets : undefined} />
          )}
          {section === "project" && <div className="asset-subsection-heading">Ships With This Scenario</div>}
          {section === "project" && (
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
                        projectDir={projectDir}
                        compact
                        selected={selectedAssetKey === item.asset.id}
                        onReplaceAsset={onReplaceAsset}
                        onDeleteAsset={onDeleteAsset}
                        onSelectPaintTile={onSelectPaintTile}
                        onSelect={(preview) => setSelectedAsset({ type: "managed", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [] })}
                      />
                    ) : (
                      <ManagedAssetCard
                        key={renderListKey("managed-asset", item.asset, index)}
                        asset={item.asset}
                        project={project}
                        desktopRuntime={desktopRuntime}
                        projectDir={projectDir}
                        compact
                        selected={selectedAssetKey === item.asset.id}
                        onReplaceAsset={onReplaceAsset}
                        onUpdateAsset={onUpdateAsset}
                        onDeleteAsset={onDeleteAsset}
                        onSelectEntity={onSelectEntity}
                        onSelect={(preview) => setSelectedAsset({ type: "managed", asset: item.asset, preview, usages: project ? resourceUsageLinks(project, item.asset.resourceType, item.asset.resourceId) : [] })}
                      />
                    ))}
                    {project && projectGalleryItems.length === 0 && (
                      <p className="empty-copy compact">No scenario assets in this section yet. Imported assets here are the media Providence will package with this scenario.</p>
                    )}
                    {!project && <p className="empty-copy compact">Open a project to manage scenario assets.</p>}
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
          {section !== "project" && (
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

function AssetGalleryControls({
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
      <label>
        <span>Preview Size</span>
        <select aria-label="Asset preview size" value={previewSize} onChange={(event) => onPreviewSizeChange(event.currentTarget.value as AssetPreviewSize)}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
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
  onSelectEntity
}: {
  item: ResourcePreviewItem | null;
  project: Project | null;
  catalog?: LibraryCatalog | null;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onOpenDetail: (item: ResourcePreviewItem) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const title = item ? resourcePreviewItemTitle(item) : "No Asset Selected";
  return (
    <aside className="asset-selection-inspector" aria-label="Selected asset inspector">
      <header>
        <div>
          <span>Selection Inspector</span>
          <strong>{title}</strong>
        </div>
        <button type="button" className="btn btn-secondary btn-xs" disabled={!item} onClick={() => item && onOpenDetail(item)}>
          Open Detail
        </button>
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
  projectAssets: Project["assets"],
  scenarioResources: ScenarioResourceAsset[],
  libraryAssets: LibraryAsset[],
  section: AssetSection
): ResourcePreviewItem | null {
  const managed = projectAssets.find((asset) => asset.id === entityId);
  if (managed) {
    return {
      type: "managed",
      asset: managed,
      preview: null,
      usages: project ? resourceUsageLinks(project, managed.resourceType, managed.resourceId) : []
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
  return assets.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.resourceId - b.resourceId || a.source.localeCompare(b.source));
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
  if (normalized === "TEXT" || normalized === "STR#") return "text";
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
