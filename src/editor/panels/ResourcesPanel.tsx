import { invoke } from "@tauri-apps/api/core";
import { ImageIcon, Music, Upload, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DecodedResourcePreview, LibraryAsset, LibraryCatalog, ManagedAsset, ManagedAssetKind, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { tileColor } from "../components/TileSprite";
import { ResourcePreviewBadge, ResourcePreviewDiagnostics } from "../components/ResourcePreviewStatus";
import { inspectBrowserBundledLibraryAssetPreview } from "../browser/library";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";

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
  onImportAssets?: (files: File[], kind: ManagedAssetKind) => void;
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
  const showAll = activeEditor === "domain";
  const showProjectAssets = showAll || activeEditor === "project-assets";
  const showSpecialLand = showAll || activeEditor === "project-assets" || activeEditor === "special-land";
  const showLibraryAssets = showAll || activeEditor === "library-assets";
  const showResourceForks = showAll || activeEditor === "resource-forks";
  const showRenderAssets = showAll || activeEditor === "render-assets";
  const [libraryPreviewFilter, setLibraryPreviewFilter] = useState<ResourcePreviewStatus | "all">("all");
  const [libraryPreviewStatuses, setLibraryPreviewStatuses] = useState<Record<string, ResourcePreviewStatus>>({});
  const visibleLibraryAssets = libraryAssets
    .filter((asset) => {
      if (libraryPreviewFilter === "all") return true;
      return (libraryPreviewStatuses[asset.id] ?? estimatedPreviewStatus(asset)) === libraryPreviewFilter;
    })
    .slice(0, 240);
  return (
    <div className="editor-full-panel asset-workbench">
      <ScrollArea className="asset-workbench-main" aria-label="Assets workbench">
      {showProjectAssets && (
      <section className="tab-panel asset-authoring-panel">
        <div className="panel-header">
          <span>Managed Assets</span>
          <div className="panel-header-actions">
            <b>{(project?.assets.length ?? 0).toLocaleString()}</b>
            <AssetImportBar onImportAssets={onImportAssets} compact />
          </div>
        </div>
        <ScrollArea className="managed-asset-grid" aria-label="Managed Assets">
          {project?.assets.map((asset, index) => (
            <ManagedAssetCard
              key={renderListKey("managed-asset", asset, index)}
              asset={asset}
              desktopRuntime={desktopRuntime}
              projectDir={projectDir}
              onReplaceAsset={onReplaceAsset}
              onUpdateAsset={onUpdateAsset}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
          {project && project.assets.length === 0 && (
            <p className="empty-copy compact">Import pictures, icons, or sounds to make them available to scripts and export.</p>
          )}
          {!project && <p className="empty-copy compact">Open a project to manage scenario assets.</p>}
        </ScrollArea>
      </section>
      )}
      {showSpecialLand && (
      <SpecialLandTilePanel
        project={project}
        libraryAssets={libraryAssets}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onImportAssets={onImportAssets}
        onReplaceAsset={onReplaceAsset}
        onDeleteAsset={onDeleteAsset}
        onSelectPaintTile={onSelectPaintTile}
      />
      )}
      {showLibraryAssets && (
      <section className="tab-panel asset-authoring-panel">
        <div className="panel-header">
          <span>Library Assets</span>
          <b>{libraryAssets.length.toLocaleString()}</b>
        </div>
        <PreviewStatusFilters value={libraryPreviewFilter} onChange={setLibraryPreviewFilter} />
        <ScrollArea className="library-asset-strip" aria-label="Library Assets">
          {visibleLibraryAssets.map((asset, index) => (
            <LibraryAssetCard
              key={renderListKey("library-asset", asset, index)}
              asset={asset}
              desktopRuntime={desktopRuntime}
              workspaceDir={workspaceDir}
              onPreviewStatus={(assetId, status) => setLibraryPreviewStatuses((statuses) => statuses[assetId] === status ? statuses : { ...statuses, [assetId]: status })}
            />
          ))}
          {visibleLibraryAssets.length === 0 && libraryAssets.length > 0 && (
            <p className="empty-copy compact">No library assets currently match this preview status.</p>
          )}
          {libraryAssets.length === 0 && <p className="empty-copy compact">Bundled libraries did not expose media assets.</p>}
        </ScrollArea>
      </section>
      )}
      {showResourceForks && (
      <section className="tab-panel resource-browser">
        <div className="panel-header">
          <span>Resource Fork Inventory</span>
          <b>{resources.length.toLocaleString()}</b>
        </div>
        <div className="resource-type-grid">
          {resourceTypes.map((entity, index) => {
            const members = resourceMembersForType(project, entity.id);
            return (
              <button key={renderListKey("resource-type", entity, index)} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
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
        <ScrollArea className="resource-list" aria-label="Resource Fork Inventory">
          {resources.slice(0, 500).map((entity, index) => {
            const consumers = resourceConsumers(project, entity.id);
            return (
              <button key={renderListKey("resource-entity", entity, index)} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
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
      {showRenderAssets && (
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
      </ScrollArea>
      <aside className="tab-panel semantic-right">
        <ScrollArea className="semantic-right-scroll" aria-label="Asset semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        </ScrollArea>
      </aside>
    </div>
  );
}

function AssetImportBar({
  onImportAssets,
  compact = false,
  fixedKind,
  label = "Import"
}: {
  onImportAssets?: (files: File[], kind: ManagedAssetKind) => void;
  compact?: boolean;
  fixedKind?: ManagedAssetKind;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ManagedAssetKind>(fixedKind ?? "picture");
  const activeKind = fixedKind ?? kind;
  const accept = activeKind === "sound" ? "audio/*" : "image/*";
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
          if (files.length) onImportAssets?.(files, activeKind);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
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
  onImportAssets?: (files: File[], kind: ManagedAssetKind) => void;
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
              <LibraryAssetCard key={renderListKey("special-land-library", asset, index)} asset={asset} desktopRuntime={desktopRuntime} workspaceDir={workspaceDir} />
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
  onSelectPaintTile
}: {
  asset: ManagedAsset;
  desktopRuntime: boolean;
  projectDir: string;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectPaintTile?: (tile: number) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  return (
    <article className="managed-asset-card special-land-card">
      <AssetPreview kind={asset.kind} label={asset.label} preview={preview} />
      <strong>{asset.label}</strong>
      <div className="asset-facts">
        <span>tile {asset.resourceId}</span>
        <span>cicn</span>
        <span>{asset.exportState}</span>
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
  desktopRuntime,
  projectDir,
  onReplaceAsset,
  onUpdateAsset,
  onDeleteAsset
}: {
  asset: ManagedAsset;
  desktopRuntime: boolean;
  projectDir: string;
  onReplaceAsset?: (assetId: string, file: File) => void;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset?: (assetId: string) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  return (
    <article className="managed-asset-card">
      <AssetPreview kind={asset.kind} label={asset.label} preview={preview} />
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
        <span>{asset.exportState}</span>
        {asset.width && asset.height ? <span>{asset.width} x {asset.height}</span> : null}
        {asset.durationMs ? <span>{(asset.durationMs / 1000).toFixed(1)}s</span> : null}
      </div>
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
          {option === "all" ? "All" : option}
        </button>
      ))}
    </div>
  );
}

function LibraryAssetCard({
  asset,
  desktopRuntime,
  workspaceDir,
  onPreviewStatus
}: {
  asset: LibraryAsset;
  desktopRuntime: boolean;
  workspaceDir: string;
  onPreviewStatus?: (assetId: string, status: ResourcePreviewStatus) => void;
}) {
  const preview = useLibraryPreview(asset, desktopRuntime, workspaceDir);
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
      />
      <strong>{asset.label}</strong>
      <small>{asset.resourceType ?? asset.type} {asset.resourceId ?? ""}</small>
      <div className="asset-facts">
        <ResourcePreviewBadge status={preview.status} />
        <span>{formatBytes(asset.bytes)}</span>
        {preview.summary.format && <span>{preview.summary.format}</span>}
      </div>
      <ResourcePreviewDiagnostics diagnostics={preview.diagnostics} />
    </article>
  );
}

function AssetPreview({
  kind,
  label,
  preview,
  status = "unknown",
  diagnostics = []
}: {
  kind: ManagedAssetKind;
  label: string;
  preview: string | null;
  status?: ResourcePreviewStatus | "unknown";
  diagnostics?: Array<string | ResourcePreviewDiagnostic>;
}) {
  if (preview && kind === "sound") {
    return <audio className="asset-audio-preview" src={preview} controls preload="metadata" />;
  }
  if (preview && kind === "text") {
    return <iframe className="asset-text-preview" src={preview} title={label} />;
  }
  if (preview && kind !== "sound") {
    return <img className="asset-image-preview" src={preview} alt={label} />;
  }
  return (
    <div className="asset-preview-placeholder">
      {kind === "sound" ? <Music size={24} /> : <ImageIcon size={24} />}
      <span>{previewFallbackLabel(kind, status)}</span>
      {diagnostics[0] && <small>{diagnosticPreviewText(diagnostics[0])}</small>}
    </div>
  );
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
  if (status === "unsupported-variant") return "Unsupported variant";
  if (status === "metadata-only") return "Metadata only";
  if (kind === "sound") return "Not playable yet";
  return "No preview";
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
  if (type === "text") return "text";
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
