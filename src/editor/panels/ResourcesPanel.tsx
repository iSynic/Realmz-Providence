import { invoke } from "@tauri-apps/api/core";
import { FileText, ImageIcon, Music, Upload, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DecodedResourcePreview, LibraryAsset, LibraryCatalog, ManagedAsset, ManagedAssetKind, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { resourceUsageLinks } from "../contentLinks";
import { tileColor } from "../components/TileSprite";
import { ResourcePreviewBadge, ResourcePreviewDiagnostics } from "../components/ResourcePreviewStatus";
import { inspectBrowserBundledLibraryAssetPreview } from "../browser/library";
import { FloatingWorkbenchPanel, ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { ResourceExportScope, isMapPlaceableLibraryAsset, managedAssetKindForLibrary, resourceExportScope, resourceExportScopeLabel, resourceOrigin, resourceOriginLabel, resourceRole } from "../resourceResolver";
import {
  assetTargetForKind,
  fileToMediaAssetRequest,
  inspectMediaAssetSource,
  MediaAssetImportOptions,
  MediaAssetSourceInfo,
  SCENARIO_PICTURE_MAX_ID,
  SCENARIO_PICTURE_MIN_ID,
  SCENARIO_SOUND_MAX_ID,
  SCENARIO_SOUND_MIN_ID,
  SCENARIO_SPLASH_PICTURE_ID
} from "../mediaAssets";

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
      {previewItem && <ResourcePreviewWindow item={previewItem} onClose={() => setPreviewItem(null)} onSelectEntity={onSelectEntity} />}
    </section>
  );
}

type AssetSection = "project" | "realmz" | "divinity" | "advanced";
const LIBRARY_PAGE_SIZE = 20;

const ASSET_SECTIONS: Array<{ id: AssetSection; editor: string; label: string }> = [
  { id: "project", editor: "project-assets", label: "Scenario Assets" },
  { id: "realmz", editor: "library-assets", label: "Reference Libraries" },
  { id: "divinity", editor: "divinity-reference", label: "Divinity Reference" },
  { id: "advanced", editor: "resource-forks", label: "Advanced Inventory" }
];

function assetSectionFromEditor(activeEditor: string): AssetSection {
  if (activeEditor === "library-assets") return "realmz";
  if (activeEditor === "divinity-reference") return "divinity";
  if (activeEditor === "resource-forks" || activeEditor === "render-assets") return "advanced";
  return "project";
}

function assetKindFilterFromEditor(activeEditor: string): ManagedAssetKind | "all" {
  if (activeEditor === "pictures") return "picture";
  if (activeEditor === "sounds") return "sound";
  if (activeEditor === "icons") return "icon";
  if (activeEditor === "special-land") return "special-land-tile";
  return "all";
}

function assetSectionTitle(section: AssetSection) {
  if (section === "realmz") return "Reference Only - Built Into Realmz";
  if (section === "divinity") return "Reference Only - Divinity";
  if (section === "advanced") return "Advanced Raw Resources";
  return "Ships With This Scenario";
}

function assetMatchesSection(asset: ManagedAsset, section: AssetSection) {
  return section === "project";
}

function libraryAssetMatchesSection(asset: LibraryAsset, section: AssetSection, showUiReference = false) {
  if (section !== "realmz" && section !== "divinity") return false;
  const origin = resourceOrigin(asset);
  if (section === "realmz") return origin === "realmz-library";
  return origin === "divinity-reference" || (showUiReference && origin === "ui-reference");
}

function assetMatchesKind(kind: ManagedAssetKind, filter: ManagedAssetKind | "all") {
  return filter === "all" || kind === filter;
}

function libraryAssetMatchesKind(asset: LibraryAsset, filter: ManagedAssetKind | "all") {
  if (filter === "all") return true;
  if (filter === "special-land-tile") return managedAssetKindForLibrary(asset) === "special-land-tile" || isMapPlaceableLibraryAsset(asset);
  return managedAssetKindForLibrary(asset) === filter;
}

function assetAuthoringGuidance(section: AssetSection, kindFilter: ManagedAssetKind | "all") {
  if (section !== "project") return "";
  if (kindFilter === "picture") {
    return `Scenario pictures use PICT IDs ${SCENARIO_PICTURE_MIN_ID}-${SCENARIO_PICTURE_MAX_ID}. ID ${SCENARIO_SPLASH_PICTURE_ID} is the title picture.`;
  }
  if (kindFilter === "sound") {
    return `Custom scenario sounds use snd IDs ${SCENARIO_SOUND_MIN_ID}-${SCENARIO_SOUND_MAX_ID}.`;
  }
  if (kindFilter === "all") {
    return `Scenario pictures use PICT IDs ${SCENARIO_PICTURE_MIN_ID}-${SCENARIO_PICTURE_MAX_ID}; custom sounds use snd IDs ${SCENARIO_SOUND_MIN_ID}-${SCENARIO_SOUND_MAX_ID}.`;
  }
  return "";
}

function AssetImportBar({
  onImportAssets,
  compact = false,
  fixedKind,
  label = "Import"
}: {
  onImportAssets?: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  compact?: boolean;
  fixedKind?: ManagedAssetKind;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ManagedAssetKind>(fixedKind ?? "picture");
  const activeKind = fixedKind ?? kind;
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fitMode, setFitMode] = useState<MediaAssetImportOptions["fitMode"]>("fit");
  const [scaleMode, setScaleMode] = useState<MediaAssetImportOptions["scaleMode"]>("smooth");
  const [matte, setMatte] = useState<MediaAssetImportOptions["matte"]>("transparent");
  const [ditherMode, setDitherMode] = useState<MediaAssetImportOptions["ditherMode"]>("none");
  const [sourceInfo, setSourceInfo] = useState<MediaAssetSourceInfo | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState("");
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const accept = activeKind === "sound" ? "audio/*" : "image/*";
  const isImage = activeKind !== "sound";
  const fixedSizeImage = activeKind === "icon" || activeKind === "special-land-tile";
  const buildOptions = (): MediaAssetImportOptions => ({
    target: assetTargetForKind(activeKind),
    fitMode,
    scaleMode,
    matte,
    paletteMode: "adaptive-256",
    ditherMode
  });
  const openImportDialog = (files: File[]) => {
    const first = files[0];
    setPendingFiles(files);
    setSourceInfo(null);
    setPreviewDataUrl(null);
    setPreviewSummary("Preparing preview...");
    setPreviewWarnings([]);
    setFitMode("fit");
    setScaleMode(isLikelyPixelArt(first, activeKind) ? "crisp" : "smooth");
    setMatte(activeKind === "picture" ? "white" : "transparent");
    setDitherMode(activeKind === "picture" ? "floyd-steinberg" : "none");
  };
  useEffect(() => {
    if (pendingFiles.length === 0) return;
    let disposed = false;
    async function loadPreview() {
      const first = pendingFiles[0];
      try {
        const info = await inspectMediaAssetSource(first, activeKind);
        const request = await fileToMediaAssetRequest(first, activeKind, previewResourceIdForKind(activeKind), buildOptions());
        if (disposed) return;
        setSourceInfo(info);
        setPreviewDataUrl(request.kind === "sound"
          ? `data:audio/wav;base64,${request.previewBase64}`
          : `data:image/png;base64,${request.previewBase64}`);
        setPreviewWarnings(request.warnings);
        setPreviewSummary(request.audio
          ? `${formatDuration(request.audio.durationMs)} at ${request.audio.sampleRate.toLocaleString()} Hz, mono 8-bit`
          : `${request.finalWidth ?? request.image?.width ?? 0} x ${request.finalHeight ?? request.image?.height ?? 0} ${request.resourceType}`);
      } catch (error) {
        if (disposed) return;
        const message = commandErrorLabel(error);
        setSourceInfo(null);
        setPreviewDataUrl(null);
        setPreviewSummary(message);
        setPreviewWarnings([message]);
      }
    }
    void loadPreview();
    return () => {
      disposed = true;
    };
  }, [activeKind, ditherMode, fitMode, matte, pendingFiles, scaleMode]);
  return (
    <div className={`asset-import-bar${compact ? " compact" : ""}`}>
      {fixedKind ? (
        <span className="asset-import-fixed-kind">{kindLabel(fixedKind)}</span>
      ) : (
        <select value={kind} onChange={(event) => setKind(event.currentTarget.value as ManagedAssetKind)}>
          <option value="picture">Picture / PICT</option>
          <option value="icon">Icon / cicn</option>
          <option value="special-land-tile">Special Land Tile / cicn</option>
          <option value="sound">Sound / snd</option>
        </select>
      )}
      <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={!onImportAssets}>
        <Upload size={14} /> {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length) openImportDialog(files);
          event.currentTarget.value = "";
        }}
      />
      {pendingFiles.length > 0 && (
        <div className="asset-import-dialog-backdrop" role="presentation">
          <div className="asset-import-dialog" role="dialog" aria-modal="true" aria-label="Prepare asset import">
            <div className="asset-import-dialog-header">
              <div>
                <b>Prepare {kindLabel(activeKind)}</b>
                <span>{pendingFiles.length === 1 ? pendingFiles[0].name : `${pendingFiles.length} files selected`}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setPendingFiles([])} aria-label="Cancel import">
                <X size={14} />
              </button>
            </div>
            <div className="asset-import-dialog-body">
              <div className="asset-import-preview">
                {previewDataUrl && activeKind === "sound" && <audio controls src={previewDataUrl} />}
                {previewDataUrl && activeKind !== "sound" && <img src={previewDataUrl} alt="Converted asset preview" />}
                {!previewDataUrl && <span>{previewSummary}</span>}
              </div>
              <div className="asset-import-settings">
                <div className="asset-import-facts">
                  <span>Target</span><b>{targetLabel(activeKind)}</b>
                  <span>Source</span><b>{sourceInfo ? sourceSummary(sourceInfo) : "Reading..."}</b>
                  <span>Output</span><b>{previewSummary}</b>
                </div>
                {isImage && (
                  <>
                    {fixedSizeImage && (
                      <label>
                        Fit
                        <select value={fitMode} onChange={(event) => setFitMode(event.currentTarget.value as MediaAssetImportOptions["fitMode"])}>
                          <option value="fit">Fit with padding</option>
                          <option value="crop">Crop center</option>
                          <option value="stretch">Stretch</option>
                        </select>
                      </label>
                    )}
                    <label>
                      Scale Quality
                      <select value={scaleMode} onChange={(event) => setScaleMode(event.currentTarget.value as MediaAssetImportOptions["scaleMode"])}>
                        <option value="smooth">Smooth</option>
                        <option value="crisp">Crisp pixels</option>
                      </select>
                    </label>
                    <label>
                      Transparent Pixels
                      <select value={matte} onChange={(event) => setMatte(event.currentTarget.value as MediaAssetImportOptions["matte"])}>
                        {activeKind !== "picture" && <option value="transparent">Keep transparent</option>}
                        <option value="white">Fill white</option>
                        <option value="black">Fill black</option>
                      </select>
                    </label>
                    <label>
                      Color Reduction
                      <select value={ditherMode} onChange={(event) => setDitherMode(event.currentTarget.value as MediaAssetImportOptions["ditherMode"])}>
                        <option value="none">Adaptive 256, no dither</option>
                        <option value="floyd-steinberg">Adaptive 256, Floyd-Steinberg</option>
                      </select>
                    </label>
                  </>
                )}
                {previewWarnings.length > 0 && (
                  <div className="asset-import-warnings">
                    {previewWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                  </div>
                )}
              </div>
            </div>
            <div className="asset-import-dialog-actions">
              <button type="button" className="btn" onClick={() => setPendingFiles([])}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onImportAssets?.(pendingFiles, activeKind, buildOptions());
                  setPendingFiles([]);
                }}
                disabled={!previewDataUrl}
              >
                Import as Scenario Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isLikelyPixelArt(file: File | undefined, kind: ManagedAssetKind) {
  return kind === "special-land-tile" || kind === "icon" || Boolean(file && /\b(icon|tile|sprite|pixel)\b/i.test(file.name));
}

function previewResourceIdForKind(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return -100;
  if (kind === "sound") return SCENARIO_SOUND_MIN_ID;
  if (kind === "icon") return 30126;
  return SCENARIO_PICTURE_MIN_ID;
}

function targetLabel(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return "32 x 32 cicn, negative tile ID";
  if (kind === "icon") return "32 x 32 cicn";
  if (kind === "sound") return "Mac snd resource";
  return "Scenario PICT resource";
}

function sourceSummary(info: MediaAssetSourceInfo) {
  if (info.kind === "sound") return `${formatDuration(info.durationMs)} at ${(info.sampleRate ?? 0).toLocaleString()} Hz, ${info.channels ?? 0} channel(s)`;
  return `${info.width ?? 0} x ${info.height ?? 0}`;
}

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs) return "0:00";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function commandErrorLabel(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function kindLabel(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return "Special Land Tile / cicn";
  if (kind === "picture") return "Picture / PICT";
  if (kind === "icon") return "Icon / cicn";
  if (kind === "sound") return "Sound / snd";
  return kind;
}

function SpecialLandTilePanel({
  project,
  libraryAssets,
  desktopRuntime,
  projectDir,
  workspaceDir,
  onImportAssets,
  onReplaceAsset,
  onDeleteAsset,
  onSelectPaintTile
}: {
  project: Project | null;
  libraryAssets: LibraryAsset[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onImportAssets?: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectPaintTile?: (tile: number) => void;
}) {
  const authoredTiles = (project?.assets ?? []).filter((asset) => asset.kind === "special-land-tile");
  const libraryTiles = libraryAssets.filter((asset) => asset.type === "special-land-tile");
  return (
    <section className="tab-panel asset-authoring-panel special-land-authoring">
      <div className="panel-header">
        <span>Special Land Tiles</span>
        <div className="panel-header-actions">
          <b>{authoredTiles.length.toLocaleString()} authored</b>
          <AssetImportBar
            compact
            fixedKind="special-land-tile"
            label="Import Tile"
            onImportAssets={project ? onImportAssets : undefined}
          />
        </div>
      </div>
      <div className="special-land-explainer">
        Special Land Tiles are 32 x 32 scenario <code>cicn</code> resources addressed by negative tile ids such as <code>-100</code>.
        They are separate from standard land tile set atlases.
      </div>
      <ScrollArea className="managed-asset-grid compact-assets" aria-label="Authored special land tiles">
        {authoredTiles.map((asset, index) => (
          <SpecialLandAssetCard
            key={renderListKey("special-land-authored", asset, index)}
            asset={asset}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            onReplaceAsset={onReplaceAsset}
            onDeleteAsset={onDeleteAsset}
            onSelectPaintTile={onSelectPaintTile}
          />
        ))}
        {project && authoredTiles.length === 0 && (
          <p className="empty-copy compact">Import a small image here to create a 32 x 32 cicn special land tile.</p>
        )}
        {!project && <p className="empty-copy compact">Open a project to author Special Land Tiles. Bundled examples remain read-only below.</p>}
      </ScrollArea>
      {libraryTiles.length > 0 && (
        <>
          <div className="subsection-label">Read-only library examples</div>
          <ScrollArea className="library-asset-strip compact-assets" aria-label="Read-only special land tile examples">
            {libraryTiles.slice(0, 48).map((asset, index) => (
              <LibraryAssetCard key={renderListKey("special-land-library", asset, index)} asset={asset} project={project} desktopRuntime={desktopRuntime} workspaceDir={workspaceDir} />
            ))}
          </ScrollArea>
        </>
      )}
    </section>
  );
}

function SpecialLandAssetCard({
  asset,
  desktopRuntime,
  projectDir,
  onReplaceAsset,
  onDeleteAsset,
  onSelectPaintTile,
  onOpenPreview
}: {
  asset: ManagedAsset;
  desktopRuntime: boolean;
  projectDir: string;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectPaintTile?: (tile: number) => void;
  onOpenPreview?: (preview: string | null) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  return (
    <article className="managed-asset-card special-land-card">
      <AssetPreview kind={asset.kind} label={asset.label} preview={preview} onOpen={() => onOpenPreview?.(preview)} />
      <strong>{asset.label}</strong>
      <ResourceScopeBadge scope={resourceExportScope(asset)} />
      <div className="asset-facts">
        <span>tile {asset.resourceId}</span>
        <span>cicn</span>
        <span>{assetExportLabel(asset.exportState)}</span>
        <span>32 x 32 export</span>
      </div>
      <div className="asset-card-actions">
        <button className="btn btn-primary btn-xs" type="button" onClick={() => onSelectPaintTile?.(asset.resourceId)}>
          Select for painting
        </button>
        <button className="btn btn-secondary btn-xs" type="button" disabled={!onReplaceAsset} onClick={() => replaceInputRef.current?.click()}>
          <Upload size={12} /> Replace
        </button>
        <button className="btn btn-danger btn-xs" type="button" onClick={() => onDeleteAsset?.(asset.id)}>
          <Trash2 size={12} /> Delete
        </button>
      </div>
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          if (file) onReplaceAsset?.(asset.id, file);
          event.currentTarget.value = "";
        }}
      />
    </article>
  );
}

function ManagedAssetCard({
  asset,
  project,
  desktopRuntime,
  projectDir,
  onReplaceAsset,
  onUpdateAsset,
  onDeleteAsset,
  onSelectEntity,
  onOpenPreview
}: {
  asset: ManagedAsset;
  project: Project | null;
  desktopRuntime: boolean;
  projectDir: string;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenPreview?: (preview: string | null) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const usages = project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [];
  const rangeNotes = projectAssetRangeNotes(asset);
  return (
    <article className="managed-asset-card">
      <AssetPreview kind={asset.kind} label={asset.label} preview={preview} onOpen={() => onOpenPreview?.(preview)} />
      <ResourceScopeBadge scope={resourceExportScope(asset)} />
      <label className="domain-field">
        <span>Name</span>
        <input
          defaultValue={asset.label}
          onBlur={(event) => {
            const label = event.currentTarget.value.trim();
            if (label && label !== asset.label) onUpdateAsset?.(asset.id, { label });
          }}
        />
      </label>
      <label className="domain-field compact-field">
        <span>{asset.resourceType.trim() || asset.resourceType} ID</span>
        <input
          type="number"
          defaultValue={asset.resourceId}
          onBlur={(event) => {
            const resourceId = Number(event.currentTarget.value);
            if (Number.isInteger(resourceId) && resourceId !== asset.resourceId) onUpdateAsset?.(asset.id, { resourceId });
          }}
        />
      </label>
      <div className="asset-facts">
        <span>{asset.kind}</span>
        <span>{assetExportLabel(asset.exportState)}</span>
        <span>{usages.length} use{usages.length === 1 ? "" : "s"}</span>
        {asset.width && asset.height ? <span>{asset.width} x {asset.height}</span> : null}
        {asset.durationMs ? <span>{(asset.durationMs / 1000).toFixed(1)}s</span> : null}
      </div>
      {rangeNotes.length > 0 && (
        <div className="asset-range-notes">
          {rangeNotes.map((note) => <span key={note}>{note}</span>)}
        </div>
      )}
      {usages.length > 0 && (
        <div className="asset-usage-list">
          {usages.slice(0, 4).map((usage) => (
            <button key={usage.key} type="button" disabled={!usage.entity} onClick={() => usage.entity && onSelectEntity?.(usage.entity)}>
              {usage.label}
              <small>{usage.detail}</small>
            </button>
          ))}
        </div>
      )}
      <div className="asset-card-actions">
        <button className="btn btn-secondary btn-xs" type="button" disabled={!onReplaceAsset} onClick={() => replaceInputRef.current?.click()}>
          <Upload size={12} /> Replace
        </button>
        <button className="btn btn-danger btn-xs" type="button" onClick={() => onDeleteAsset?.(asset.id)}>
          <Trash2 size={12} /> Delete
        </button>
      </div>
      <input
        ref={replaceInputRef}
        type="file"
        accept={asset.kind === "sound" ? "audio/*" : "image/*"}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          if (file) onReplaceAsset?.(asset.id, file);
          event.currentTarget.value = "";
        }}
      />
    </article>
  );
}

function projectAssetRangeNotes(asset: ManagedAsset) {
  const notes: string[] = [];
  if (asset.kind === "picture") {
    if (asset.resourceId === SCENARIO_SPLASH_PICTURE_ID) {
      notes.push("Title picture ID");
    } else if (asset.resourceId < SCENARIO_PICTURE_MIN_ID || asset.resourceId > SCENARIO_PICTURE_MAX_ID) {
      notes.push(`Outside scenario picture IDs ${SCENARIO_PICTURE_MIN_ID}-${SCENARIO_PICTURE_MAX_ID}`);
    }
  }
  if (asset.kind === "sound" && (asset.resourceId < SCENARIO_SOUND_MIN_ID || asset.resourceId > SCENARIO_SOUND_MAX_ID)) {
    notes.push(`Outside custom sound IDs ${SCENARIO_SOUND_MIN_ID}-${SCENARIO_SOUND_MAX_ID}`);
  }
  return notes;
}

function PreviewStatusFilters({
  value,
  onChange
}: {
  value: ResourcePreviewStatus | "all";
  onChange: (value: ResourcePreviewStatus | "all") => void;
}) {
  const options: Array<ResourcePreviewStatus | "all"> = [
    "all",
    "preview-ready",
    "playable",
    "text-ready",
    "metadata-only",
    "unsupported-variant",
    "malformed",
    "missing-fallback"
  ];
  return (
    <div className="resource-preview-filters" role="toolbar" aria-label="Resource preview filters">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "active" : ""}
          onClick={() => onChange(option)}
        >
          {previewFilterLabel(option)}
        </button>
      ))}
    </div>
  );
}

function previewFilterLabel(status: ResourcePreviewStatus | "all") {
  if (status === "all") return "All";
  if (status === "preview-ready") return "Previewable";
  if (status === "playable") return "Playable";
  if (status === "text-ready") return "Readable Text";
  if (status === "metadata-only") return "Info Only";
  if (status === "unsupported-variant") return "Cannot Preview";
  if (status === "malformed") return "Problem";
  if (status === "missing-fallback") return "Missing";
  return status;
}

function LibraryAssetCard({
  asset,
  project,
  desktopRuntime,
  workspaceDir,
  onSelectEntity,
  onOpenPreview,
  onPreviewStatus
}: {
  asset: LibraryAsset;
  project: Project | null;
  desktopRuntime: boolean;
  workspaceDir: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenPreview?: (preview: AssetPreviewState) => void;
  onPreviewStatus?: (assetId: string, status: ResourcePreviewStatus) => void;
}) {
  const preview = useLibraryPreview(asset, desktopRuntime, workspaceDir);
  const usages = project ? resourceUsageLinks(project, asset.resourceType, asset.resourceId) : [];
  const origin = resourceOrigin(asset);
  const scope = resourceExportScope(asset);
  const placeable = isMapPlaceableLibraryAsset(asset);
  useEffect(() => {
    onPreviewStatus?.(asset.id, preview.status === "unknown" ? estimatedPreviewStatus(asset) : preview.status);
  }, [asset, onPreviewStatus, preview.status]);
  return (
    <article className="managed-asset-card library">
      <AssetPreview
        kind={assetKind(asset.type)}
        label={asset.label}
        preview={preview.dataUrl}
        status={preview.status}
        diagnostics={preview.diagnostics}
        onOpen={() => onOpenPreview?.(preview)}
      />
      <ResourceScopeBadge scope={scope} />
      <strong>{asset.label}</strong>
      <small>{asset.resourceType ?? asset.type} {asset.resourceId ?? ""}</small>
      <div className="asset-facts">
        <span>{resourceOriginLabel(origin)}</span>
        <span>{roleLabel(resourceRole(asset))}</span>
        <ResourcePreviewBadge status={preview.status} />
        <span>{formatBytes(asset.bytes)}</span>
        <span>{usages.length} use{usages.length === 1 ? "" : "s"}</span>
        {placeable && <span>Map paintable</span>}
        {preview.summary.format && <span>{preview.summary.format}</span>}
      </div>
      {usages.length > 0 && (
        <div className="asset-usage-list">
          {usages.slice(0, 4).map((usage) => (
            <button key={usage.key} type="button" disabled={!usage.entity} onClick={() => usage.entity && onSelectEntity?.(usage.entity)}>
              {usage.label}
              <small>{usage.detail}</small>
            </button>
          ))}
        </div>
      )}
      <ResourcePreviewDiagnostics diagnostics={preview.diagnostics} />
      <div className="asset-card-actions">
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => onOpenPreview?.(preview)}>
          Open Detail
        </button>
      </div>
    </article>
  );
}

function AssetPagination({
  page,
  pageCount,
  total,
  onPageChange
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const first = page * LIBRARY_PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * LIBRARY_PAGE_SIZE);
  return (
    <div className="asset-pagination" aria-label="Reference asset pages">
      <button type="button" className="btn btn-secondary btn-xs" disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>
        Previous
      </button>
      <span>
        {first.toLocaleString()}-{last.toLocaleString()} of {total.toLocaleString()}
        <small>Page {page + 1} of {pageCount}</small>
      </span>
      <button type="button" className="btn btn-secondary btn-xs" disabled={page >= pageCount - 1} onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}>
        Next
      </button>
    </div>
  );
}

function AssetPreview({
  kind,
  label,
  preview,
  status = "unknown",
  diagnostics = [],
  onOpen
}: {
  kind: ManagedAssetKind;
  label: string;
  preview: string | null;
  status?: ResourcePreviewStatus | "unknown";
  diagnostics?: Array<string | ResourcePreviewDiagnostic>;
  onOpen?: () => void;
}) {
  if (preview && kind === "sound") {
    return (
      <div className="asset-audio-preview-shell">
        <audio className="asset-audio-preview" src={preview} controls preload="metadata" />
        {onOpen && <button type="button" onClick={onOpen}>Open Detail</button>}
      </div>
    );
  }
  if (preview && kind === "text") {
    return (
      <button type="button" className="asset-text-preview-card" onClick={onOpen}>
        <FileText size={22} />
        <span>Open text resource</span>
      </button>
    );
  }
  if (preview && kind !== "sound") {
    return (
      <button type="button" className="asset-preview-button" onClick={onOpen}>
        <img className="asset-image-preview" src={preview} alt={label} />
      </button>
    );
  }
  const placeholder = (
    <div className="asset-preview-placeholder">
      {kind === "sound" ? <Music size={24} /> : <ImageIcon size={24} />}
      <span>{previewFallbackLabel(kind, status)}</span>
      {diagnostics[0] && <small>{diagnosticPreviewText(diagnostics[0])}</small>}
    </div>
  );
  return onOpen ? <button type="button" className="asset-preview-button" onClick={onOpen}>{placeholder}</button> : placeholder;
}

type ResourcePreviewItem =
  | { type: "managed"; asset: ManagedAsset; preview: string | null; usages: ReturnType<typeof resourceUsageLinks> }
  | { type: "library"; asset: LibraryAsset; preview: AssetPreviewState; usages: ReturnType<typeof resourceUsageLinks> }
  | { type: "resource"; entity: SemanticEntity; consumers: ReturnType<typeof resourceConsumers> };

function ResourceScopeBadge({ scope }: { scope: ResourceExportScope }) {
  return <span className={`resource-scope-badge ${scope}`}>{resourceExportScopeLabel(scope)}</span>;
}

function ResourcePreviewWindow({
  item,
  onClose,
  onSelectEntity
}: {
  item: ResourcePreviewItem;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const title = item.type === "resource" ? item.entity.label : item.asset.label;
  const scope = item.type === "managed"
    ? resourceExportScope(item.asset)
    : item.type === "library"
      ? resourceExportScope(item.asset)
      : "unknown-advanced";
  return (
    <FloatingWorkbenchPanel
      title={title}
      eyebrow={item.type === "managed" ? "Scenario Asset" : item.type === "library" ? "Reference Asset" : "Raw Resource"}
      storageKey="assets.resourcePreview.position"
      defaultWidth={760}
      defaultHeight={620}
      minWidth={460}
      minHeight={360}
      className="asset-resource-preview-window"
      actions={<button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close resource preview"><X size={14} /></button>}
    >
      <div className="resource-detail-view">
        <ResourceScopeBadge scope={scope} />
        {item.type === "managed" && (
          <>
            <ResourcePreviewMedia kind={item.asset.kind} preview={item.preview} label={item.asset.label} />
            <ResourceFactGrid rows={[
              ["Resource", `${item.asset.resourceType} ${item.asset.resourceId}`],
              ["Kind", kindLabel(item.asset.kind)],
              ["Export", assetExportLabel(item.asset.exportState)],
              ["Size", item.asset.width && item.asset.height ? `${item.asset.width} x ${item.asset.height}` : formatBytes(item.asset.bytes)]
            ]} />
            <UsageLinks usages={item.usages} onSelectEntity={onSelectEntity} />
          </>
        )}
        {item.type === "library" && (
          <>
            <ResourcePreviewMedia kind={managedAssetKindForLibrary(item.asset)} preview={item.preview.dataUrl} label={item.asset.label} />
            <ResourceFactGrid rows={[
              ["Resource", `${item.asset.resourceType ?? item.asset.type} ${item.asset.resourceId ?? ""}`.trim()],
              ["Role", roleLabel(resourceRole(item.asset))],
              ["Origin", resourceOriginLabel(resourceOrigin(item.asset))],
              ["Preview", previewFilterLabel(item.preview.status === "unknown" ? estimatedPreviewStatus(item.asset) : item.preview.status)],
              ["Bytes", formatBytes(item.asset.bytes)],
              ["Path", item.asset.relativePath]
            ]} />
            {Object.keys(item.preview.summary).length > 0 && <ResourceFactGrid title="Preview Details" rows={Object.entries(item.preview.summary)} />}
            <ResourcePreviewDiagnostics diagnostics={item.preview.diagnostics} />
            <UsageLinks usages={item.usages} onSelectEntity={onSelectEntity} />
          </>
        )}
        {item.type === "resource" && (
          <>
            <ResourceFactGrid rows={[
              ["ID", item.entity.id],
              ["Type", item.entity.type],
              ["State", resourceStatus(item.entity)],
              ["Source", item.entity.source]
            ]} />
            <ResourceFactGrid title="Decoded Fields" rows={Object.entries(item.entity.summary).map(([key, value]) => [key, compactValue(value)])} />
            {item.consumers.length > 0 && (
              <div className="resource-usage-list">
                <strong>Used By</strong>
                {item.consumers.slice(0, 20).map((link) => (
                  <button key={link.id} type="button" onClick={() => onSelectEntity(selectEntityFromId(link.from))}>
                    {link.from}
                    <small>{link.kind}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </FloatingWorkbenchPanel>
  );
}

function ResourcePreviewMedia({ kind, preview, label }: { kind: ManagedAssetKind; preview: string | null; label: string }) {
  if (preview && kind === "sound") return <audio className="resource-detail-audio" src={preview} controls preload="metadata" />;
  if (preview && kind === "text") return <iframe className="resource-detail-text" src={preview} title={label} />;
  if (preview) return <img className="resource-detail-image" src={preview} alt={label} />;
  return (
    <div className="resource-detail-missing">
      {kind === "sound" ? <Music size={28} /> : kind === "text" ? <FileText size={28} /> : <ImageIcon size={28} />}
      <span>No preview available</span>
    </div>
  );
}

function ResourceFactGrid({ title, rows }: { title?: string; rows: Array<[string, string]> }) {
  return (
    <div className="resource-fact-grid">
      {title && <strong>{title}</strong>}
      {rows.map(([label, value]) => (
        <div key={`${label}:${value}`}>
          <span>{label}</span>
          <b>{value || "none"}</b>
        </div>
      ))}
    </div>
  );
}

function UsageLinks({ usages, onSelectEntity }: { usages: ReturnType<typeof resourceUsageLinks>; onSelectEntity: (entity: SelectedEntity) => void }) {
  if (usages.length === 0) return null;
  return (
    <div className="resource-usage-list">
      <strong>Used By</strong>
      {usages.slice(0, 20).map((usage) => (
        <button key={usage.key} type="button" disabled={!usage.entity} onClick={() => usage.entity && onSelectEntity(usage.entity)}>
          {usage.label}
          <small>{usage.detail}</small>
        </button>
      ))}
    </div>
  );
}

function roleLabel(role: ReturnType<typeof resourceRole>) {
  if (role === "scenario-picture") return "Scenario picture";
  if (role === "picture") return "Picture";
  if (role === "sound") return "Sound";
  if (role === "icon") return "Icon";
  if (role === "special-land-tile") return "Special land tile";
  if (role === "tile-atlas") return "Tile atlas";
  if (role === "text-resource") return "Text resource";
  if (role === "string-list") return "String list";
  if (role === "style") return "Style data";
  if (role === "version") return "Version data";
  if (role === "ui-art") return "UI artwork";
  return "Raw resource";
}

function useProjectPreview(path: string, desktopRuntime: boolean, projectDir: string) {
  const [preview, setPreview] = useState<string | null>(() => path.startsWith("data:") ? path : null);
  useEffect(() => {
    let disposed = false;
    if (!desktopRuntime || path.startsWith("data:") || !projectDir) {
      setPreview(path.startsWith("data:") ? path : null);
      return;
    }
    invoke<string>("load_project_asset_preview", { projectDir, relativePath: path })
      .then((url) => {
        if (!disposed) setPreview(url);
      })
      .catch(() => {
        if (!disposed) setPreview(null);
      });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, path, projectDir]);
  return preview;
}

type AssetPreviewState = {
  dataUrl: string | null;
  status: ResourcePreviewStatus | "unknown";
  summary: Record<string, string>;
  diagnostics: ResourcePreviewDiagnostic[];
};

function initialPreviewState(dataUrl: string | null): AssetPreviewState {
  return {
    dataUrl,
    status: dataUrl ? "preview-ready" : "metadata-only",
    summary: {},
    diagnostics: []
  };
}

function useLibraryPreview(asset: LibraryAsset, desktopRuntime: boolean, workspaceDir: string) {
  const [preview, setPreview] = useState<AssetPreviewState>(() => initialPreviewState(asset.previewPath ?? null));
  useEffect(() => {
    let disposed = false;
    if (!desktopRuntime) {
      inspectBrowserBundledLibraryAssetPreview(asset)
        .then((decoded) => {
          if (!disposed) {
            setPreview({
              dataUrl: decoded.dataUrl ?? asset.previewPath ?? null,
              status: decoded.status,
              summary: decoded.summary,
              diagnostics: decoded.diagnostics
            });
          }
        })
        .catch((error) => {
          if (!disposed) {
            setPreview({
              ...initialPreviewState(asset.previewPath ?? null),
              status: "unsupported-variant",
              diagnostics: [previewDiagnostic("browser.preview_failed", error instanceof Error ? error.message : "Browser preview fallback could not decode this bundled asset.", "browser-library")]
            });
          }
        });
      return () => {
        disposed = true;
      };
    }
    if (!workspaceDir) {
      setPreview({
        ...initialPreviewState(asset.previewPath ?? null),
        status: asset.previewPath ? estimatedPreviewStatus(asset) : "missing-fallback",
        diagnostics: asset.previewPath ? [] : [previewDiagnostic("desktop.workspace_missing", "Workspace path is not available for structured preview inspection.", "tauri")]
      });
      return;
    }
    invoke<DecodedResourcePreview>("inspect_library_asset_preview", { workspaceDir, source: asset.source, relativePath: asset.relativePath })
      .then((decoded) => {
        if (!disposed) {
          setPreview({
            dataUrl: decoded.dataUrl ?? asset.previewPath ?? null,
            status: decoded.status,
            summary: decoded.summary,
            diagnostics: decoded.diagnostics
          });
        }
      })
      .catch(() => {
        invoke<string>("load_library_asset_preview", { workspaceDir, source: asset.source, relativePath: asset.relativePath })
          .then((url) => {
            if (!disposed) {
              setPreview({
                dataUrl: url,
                status: "preview-ready",
                summary: {},
                diagnostics: [previewDiagnostic("desktop.structured_preview_failed", "Structured resource preview failed, but raw preview bytes were available.", "tauri")]
              });
            }
          })
          .catch(() => {
            if (!disposed) {
              setPreview({
                dataUrl: null,
                status: "unsupported-variant",
                summary: {},
                diagnostics: [previewDiagnostic("desktop.no_preview", "No preview decoder or raw fallback could read this resource.", "tauri")]
              });
            }
          });
      });
    return () => {
      disposed = true;
    };
  }, [asset.id, asset.previewPath, asset.relativePath, asset.source, desktopRuntime, workspaceDir]);
  return preview;
}

function estimatedPreviewStatus(asset: LibraryAsset): ResourcePreviewStatus {
  if (asset.type === "sound" || asset.resourceType === "snd ") return "playable";
  if (asset.type === "text" || asset.resourceType === "TEXT" || asset.resourceType === "STR#") return "text-ready";
  if (asset.resourceType === "styl" || asset.resourceType === "vers" || asset.resourceType === "RLMZ") return "metadata-only";
  if (
    asset.previewPath ||
    asset.resourceType === "PICT" ||
    asset.resourceType === "cicn" ||
    asset.type === "picture" ||
    asset.type === "icon" ||
    asset.type.includes("icon") ||
    asset.type === "special-land-tile"
  ) return "preview-ready";
  return "metadata-only";
}

function previewFallbackLabel(kind: ManagedAssetKind, status: ResourcePreviewStatus | "unknown") {
  if (status === "missing-fallback") return "Missing fallback";
  if (status === "malformed") return "Malformed resource";
  if (status === "unsupported-variant") return "Cannot preview";
  if (status === "metadata-only") return "Info only";
  if (kind === "sound") return "Not playable yet";
  return "No preview";
}

function assetExportLabel(state: ManagedAsset["exportState"]) {
  if (state === "ready") return "Exports with scenario";
  if (state === "preview-only") return "Preview only";
  if (state === "blocked") return "Needs attention";
  return "Project asset";
}

function diagnosticPreviewText(diagnostic: string | ResourcePreviewDiagnostic) {
  if (typeof diagnostic === "string") return diagnostic;
  const bits = [diagnostic.message];
  if (diagnostic.opcode) bits.push(diagnostic.opcode);
  if (diagnostic.offset != null) bits.push(`offset ${diagnostic.offset}`);
  if (diagnostic.variant) bits.push(diagnostic.variant);
  return bits.join(" | ");
}

function previewDiagnostic(code: string, message: string, decoder: string): ResourcePreviewDiagnostic {
  return { severity: "warning", code, message, decoder };
}

function assetKind(type: string): ManagedAssetKind {
  if (type === "sound") return "sound";
  if (type === "special-land-tile") return "special-land-tile";
  if (type === "icon" || type.includes("icon")) return "icon";
  if (type === "picture") return "picture";
  if (type === "text" || type.includes("text") || type.includes("string")) return "text";
  return "other";
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < 1024) return `${value.toLocaleString()} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function resourceStatus(entity: { type: string; editState: string; summary: Record<string, unknown> }) {
  if (entity.summary.sharedFallback) return "shared fallback";
  if (entity.summary.referenceOnly) return "reference only";
  if (entity.type === "runtime-cache") return "generated cache";
  if (entity.type === "asset-fallback") return "missing asset";
  return entity.editState;
}

function numberSummary(value: unknown) {
  return typeof value === "number" ? value : 0;
}
