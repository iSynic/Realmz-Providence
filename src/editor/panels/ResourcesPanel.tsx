import { useEffect, useState } from "react";
import { LibraryCatalog, ManagedAssetKind, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../types";
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
  AssetPreview,
  LIBRARY_PAGE_SIZE,
  LibraryAssetCard,
  ManagedAssetCard,
  PreviewStatusFilters,
  ResourceScopeBadge,
  ResourcePreviewItem,
  ResourcePreviewWindow,
  SpecialLandAssetCard,
  assetAuthoringGuidance,
  assetKindFilterFromEditor,
  assetMatchesKind,
  assetMatchesSection,
  assetSectionFromEditor,
  assetSectionTitle,
  formatBytes,
  libraryAssetMatchesKind,
  libraryAssetMatchesSection,
  numberSummary,
  resourceStatus,
  estimatedPreviewStatus,
  useProjectPreview
} from "./resources/ResourceWidgets";
import { RecordsPanel } from "./RecordsPanel";

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
  const scenarioResources = scenarioResourceAssets(project).filter((asset) =>
    section === "project" &&
    assetMatchesKind(asset.kind, kindFilter) &&
    (!normalizedQuery || `${asset.entity.label} ${asset.resourceType} ${asset.resourceId} ${asset.source}`.toLowerCase().includes(normalizedQuery))
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
      {section !== "records" && (
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
      )}
      <div className="asset-workbench-main" aria-label="Assets workbench">
      {section === "records" && (
        <RecordsPanel project={project} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} />
      )}
      {section !== "advanced" && section !== "records" && (
        <section className="tab-panel asset-authoring-panel">
          <div className="panel-header">
            <span>{assetSectionTitle(section)}</span>
            <b>{section === "project" ? `${(projectAssets.length + scenarioResources.length).toLocaleString()} scenario asset${projectAssets.length + scenarioResources.length === 1 ? "" : "s"}` : `${matchingLibraryAssets.length.toLocaleString()} reference asset${matchingLibraryAssets.length === 1 ? "" : "s"}`}</b>
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
            {scenarioResources.map((asset, index) => (
              <ScenarioResourceAssetCard
                key={renderListKey("scenario-resource-asset", asset.entity, index)}
                asset={asset}
                project={project}
                desktopRuntime={desktopRuntime}
                projectDir={projectDir}
                onSelectEntity={onSelectEntity}
                onOpenPreview={() => setPreviewItem({ type: "resource", entity: asset.entity, consumers: project ? resourceConsumers(project, asset.entity.id) : [] })}
              />
            ))}
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
            {project && projectAssets.length === 0 && scenarioResources.length === 0 && (
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
  desktopRuntime,
  projectDir,
  onSelectEntity,
  onOpenPreview
}: {
  asset: ScenarioResourceAsset;
  project: Project | null;
  desktopRuntime: boolean;
  projectDir: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenPreview: () => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
  const consumers = project ? resourceConsumers(project, asset.entity.id) : [];
  return (
    <article className="managed-asset-card scenario-resource">
      <AssetPreview
        kind={asset.kind}
        label={asset.entity.label}
        preview={preview}
        status={scenarioResourcePreviewStatus(asset.entity)}
        diagnostics={scenarioResourcePreviewDiagnostics(asset.entity)}
        onOpen={onOpenPreview}
      />
      <ResourceScopeBadge scope="ships-with-scenario" />
      <strong>{asset.entity.label}</strong>
      <small>{asset.resourceType} {asset.resourceId}</small>
      <div className="asset-facts">
        <span>{scenarioResourceRoleLabel(asset)}</span>
        <span>{formatBytes(asset.bytes)}</span>
        <span>{consumers.length} use{consumers.length === 1 ? "" : "s"}</span>
        <span>{asset.source}</span>
      </div>
      {consumers.length > 0 && (
        <div className="asset-usage-list">
          {consumers.slice(0, 4).map((usage) => (
            <button key={usage.id} type="button" onClick={() => onSelectEntity(selectEntityFromId(usage.from))}>
              {usage.from}
              <small>{usage.kind}</small>
            </button>
          ))}
        </div>
      )}
      <div className="asset-card-actions">
        <button className="btn btn-secondary btn-xs" type="button" onClick={onOpenPreview}>
          Open Detail
        </button>
      </div>
    </article>
  );
}

function scenarioResourceAssets(project: Project | null): ScenarioResourceAsset[] {
  if (!project) return [];
  const assets: ScenarioResourceAsset[] = [];
  const seen = new Set<string>();
  for (const entity of project.semanticSchema.entities) {
    if (entity.type !== "resource") continue;
    if (entity.summary.referenceOnly === true || entity.summary.scenarioSupplied === false || entity.confidence === "inferred") continue;
    const resourceType = resourceTypeFromSummary(entity.summary);
    const resourceId = resourceIdFromSummary(entity.summary);
    if (!resourceType || resourceId == null) continue;
    const key = `${resourceType}:${resourceId}:${entity.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push({
      entity,
      kind: managedKindForResource(resourceType),
      resourceType,
      resourceId,
      source: entity.source,
      bytes: typeof entity.summary.bytes === "number" ? entity.summary.bytes : 0,
      previewPath: scenarioResourcePreviewPath(project, entity, resourceType, resourceId)
    });
  }
  return assets.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.resourceId - b.resourceId || a.source.localeCompare(b.source));
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

function scenarioResourceRoleLabel(asset: ScenarioResourceAsset) {
  if (asset.resourceType === "PICT" && asset.resourceId >= 30000 && asset.resourceId <= 30128) return "Scenario picture";
  if (asset.resourceType === "PICT" && asset.resourceId >= 306 && asset.resourceId <= 308) return "Custom landlook atlas";
  if (asset.resourceType === "cicn" && asset.resourceId < 0) return "Special land tile";
  if (asset.resourceType === "cicn") return "Icon";
  if (asset.resourceType.trim() === "snd") return "Sound";
  if (asset.resourceType === "TEXT") return "Text resource";
  if (asset.resourceType === "STR#") return "String list";
  if (asset.resourceType === "styl") return "Style data";
  if (asset.resourceType === "vers") return "Version data";
  return "Raw resource";
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

function scenarioResourcePreviewPath(project: Project, entity: SemanticEntity, resourceType: string, resourceId: number) {
  if (typeof entity.summary.previewDataUrl === "string" && entity.summary.previewDataUrl) return entity.summary.previewDataUrl;
  if (resourceType === "PICT") {
    return project.assetCatalog.pictures?.find((asset) => asset.resourceId === resourceId)?.previewPath ??
      project.assetCatalog.tilesets.find((asset) => asset.pictId === resourceId)?.imagePath ??
      "";
  }
  if (resourceType === "cicn") {
    return project.assetCatalog.icons?.find((asset) => asset.resourceId === resourceId)?.previewPath ?? "";
  }
  return "";
}
