import { useEffect, useState } from "react";
import { LibraryCatalog, ManagedAssetKind, Project, ResourcePreviewStatus, SelectedEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { resourceUsageLinks } from "../contentLinks";
import { tileColor } from "../components/TileSprite";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { MediaAssetImportOptions } from "../mediaAssets";
import {
  ASSET_SECTIONS,
  AssetImportBar,
  AssetPagination,
  AssetSection,
  LIBRARY_PAGE_SIZE,
  LibraryAssetCard,
  ManagedAssetCard,
  PreviewStatusFilters,
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
  estimatedPreviewStatus
} from "./resources/ResourceWidgets";

export function ResourcesPanel({
  project,
  catalog,
  selectedEntity,
  activeEditor = "domain",
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
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
  onSelectEntity: (entity: SelectedEntity) => void;
  onImportAssets?: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectPaintTile?: (tile: number) => void;
}) {
  const resourceTypes = schemaEntities(project, "resource type");
  const resources = schemaEntities(project).filter((entity) => entity.type === "resource" || entity.type === "runtime-cache" || entity.type === "asset-fallback" || entity.type === "render-profile");
  const tileAtlases = schemaEntities(project, "tile atlas");
  const gaps = resourceGaps(project);
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
  const [libraryPreviewFilter, setLibraryPreviewFilter] = useState<ResourcePreviewStatus | "all">("all");
  const [libraryPreviewStatuses, setLibraryPreviewStatuses] = useState<Record<string, ResourcePreviewStatus>>({});
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const projectAssets = (project?.assets ?? []).filter((asset) =>
    assetMatchesSection(asset, section) &&
    assetMatchesKind(asset.kind, kindFilter) &&
    (!normalizedQuery || `${asset.label} ${asset.resourceType} ${asset.resourceId} ${asset.fileName}`.toLowerCase().includes(normalizedQuery))
  );
  useEffect(() => {
    setLibraryPage(0);
  }, [section, kindFilter, normalizedQuery, libraryPreviewFilter, showUiReference]);
  const matchingLibraryAssets = libraryAssets
    .filter((asset) => {
      if (!libraryAssetMatchesSection(asset, section, showUiReference)) return false;
      if (!libraryAssetMatchesKind(asset, kindFilter)) return false;
      if (normalizedQuery && !`${asset.label} ${asset.resourceType ?? ""} ${asset.resourceId ?? ""} ${asset.relativePath}`.toLowerCase().includes(normalizedQuery)) return false;
      if (libraryPreviewFilter === "all") return true;
      return (libraryPreviewStatuses[asset.id] ?? estimatedPreviewStatus(asset)) === libraryPreviewFilter;
    });
  const libraryPageCount = Math.max(1, Math.ceil(matchingLibraryAssets.length / LIBRARY_PAGE_SIZE));
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount - 1);
  const visibleLibraryAssets = matchingLibraryAssets.slice(currentLibraryPage * LIBRARY_PAGE_SIZE, (currentLibraryPage + 1) * LIBRARY_PAGE_SIZE);
  const authoringGuidance = assetAuthoringGuidance(section, kindFilter);
  const selectedAdvancedType = resourceTypes.find((entity) => entity.id === advancedTypeId) ?? null;
  const advancedResources = selectedAdvancedType ? resourceMembersForType(project, selectedAdvancedType.id) : resources;
  return (
    <section className="editor-full-panel asset-workbench">
      <header className="asset-workbench-header">
        <div>
          <h1>Assets</h1>
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
            {item.label}
          </button>
        ))}
      </div>
      <div className="asset-filter-row">
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search assets..." />
        <select value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value as ManagedAssetKind | "all")} aria-label="Asset kind filter">
          <option value="all">All Types</option>
          <option value="picture">Pictures</option>
          <option value="sound">Sounds</option>
          <option value="icon">Icons</option>
          <option value="special-land-tile">Special Land Tiles</option>
          <option value="text">Text Resources</option>
          <option value="other">Other</option>
        </select>
        <PreviewStatusFilters value={libraryPreviewFilter} onChange={setLibraryPreviewFilter} />
        {section === "divinity" && (
          <label className="asset-inline-toggle" title="Show Divinity/Realmz application interface artwork. These resources are not scenario media.">
            <input type="checkbox" checked={showUiReference} onChange={(event) => setShowUiReference(event.currentTarget.checked)} />
            Show UI Reference
          </label>
        )}
      </div>
      <div className="asset-workbench-main" aria-label="Assets workbench">
      {section !== "advanced" && (
        <section className="tab-panel asset-authoring-panel">
          <div className="panel-header">
            <span>{assetSectionTitle(section)}</span>
            <b>{section === "project" ? `${projectAssets.length.toLocaleString()} scenario asset${projectAssets.length === 1 ? "" : "s"}` : `${matchingLibraryAssets.length.toLocaleString()} reference asset${matchingLibraryAssets.length === 1 ? "" : "s"}`}</b>
          </div>
          {kindFilter === "special-land-tile" && (
            <div className="special-land-explainer">
              Special Land Tiles are 32 x 32 <code>cicn</code> resources addressed by negative tile ids. They paint directly onto map cells.
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
          <div className="managed-asset-grid" aria-label="Scenario assets">
            {projectAssets.map((asset, index) => asset.kind === "special-land-tile" ? (
              <SpecialLandAssetCard
                key={renderListKey("project-special-land", asset, index)}
                asset={asset}
                desktopRuntime={desktopRuntime}
                projectDir={projectDir}
                onReplaceAsset={onReplaceAsset}
                onDeleteAsset={onDeleteAsset}
                onSelectPaintTile={onSelectPaintTile}
                onOpenPreview={(preview) => setPreviewItem({ type: "managed", asset, preview, usages: project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [] })}
              />
            ) : (
              <ManagedAssetCard
                key={renderListKey("managed-asset", asset, index)}
                asset={asset}
                project={project}
                desktopRuntime={desktopRuntime}
                projectDir={projectDir}
                onReplaceAsset={onReplaceAsset}
                onUpdateAsset={onUpdateAsset}
                onDeleteAsset={onDeleteAsset}
                onSelectEntity={onSelectEntity}
                onOpenPreview={(preview) => setPreviewItem({ type: "managed", asset, preview, usages: project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [] })}
              />
            ))}
            {project && projectAssets.length === 0 && (
              <p className="empty-copy compact">No scenario assets in this section yet. Imported assets here are the media Providence will package with this scenario.</p>
            )}
            {!project && <p className="empty-copy compact">Open a project to manage scenario assets.</p>}
          </div>
          )}
          {section !== "project" && (
            <>
              <div className="asset-subsection-heading">{assetSectionTitle(section)}</div>
              {matchingLibraryAssets.length > LIBRARY_PAGE_SIZE && (
                <AssetPagination
                  page={currentLibraryPage}
                  pageCount={libraryPageCount}
                  total={matchingLibraryAssets.length}
                  onPageChange={setLibraryPage}
                />
              )}
              <div className="library-asset-strip" aria-label="Library assets">
                {visibleLibraryAssets.map((asset, index) => (
                  <LibraryAssetCard
                    key={renderListKey("library-asset", asset, index)}
                    asset={asset}
                    project={project}
                    desktopRuntime={desktopRuntime}
                    workspaceDir={workspaceDir}
                    onSelectEntity={onSelectEntity}
                    onOpenPreview={(preview) => setPreviewItem({ type: "library", asset, preview, usages: project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [] })}
                    onPreviewStatus={(assetId, status) => setLibraryPreviewStatuses((statuses) => statuses[assetId] === status ? statuses : { ...statuses, [assetId]: status })}
                  />
                ))}
                {visibleLibraryAssets.length === 0 && libraryAssets.length > 0 && (
                  <p className="empty-copy compact">No reference assets match this search.</p>
                )}
                {libraryAssets.length === 0 && <p className="empty-copy compact">Bundled libraries did not expose media assets.</p>}
              </div>
            </>
          )}
        </section>
      )}
      {section === "advanced" && (
      <section className="tab-panel resource-browser">
        <div className="panel-header">
          <span>Advanced Resources</span>
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
              <header>Resource Fallbacks</header>
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
          <span>Tile Atlases</span>
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
          desktopRuntime={desktopRuntime}
          projectDir={projectDir}
          onClose={() => setPreviewItem(null)}
          onSelectEntity={onSelectEntity}
        />
      )}
    </section>
  );
}
