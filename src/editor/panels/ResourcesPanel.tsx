import { invoke } from "@tauri-apps/api/core";
import { ImageIcon, Music, Upload, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DecodedResourcePreview, LibraryAsset, LibraryCatalog, ManagedAsset, ManagedAssetKind, Project, SelectedEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { tileColor } from "../components/TileSprite";
import { loadBrowserBundledLibraryAssetPreview } from "../browser/library";

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
  return (
    <div className="editor-full-panel asset-workbench">
      <div className="asset-workbench-main">
      {showProjectAssets && (
      <section className="tab-panel asset-authoring-panel">
        <div className="panel-header">
          <span>Managed Assets</span>
          <div className="panel-header-actions">
            <b>{(project?.assets.length ?? 0).toLocaleString()}</b>
            <AssetImportBar onImportAssets={onImportAssets} compact />
          </div>
        </div>
        <div className="managed-asset-grid">
          {project?.assets.map((asset) => (
            <ManagedAssetCard
              key={asset.id}
              asset={asset}
              desktopRuntime={desktopRuntime}
              projectDir={projectDir}
              onUpdateAsset={onUpdateAsset}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
          {project && project.assets.length === 0 && (
            <p className="empty-copy compact">Import pictures, icons, or sounds to make them available to scripts and export.</p>
          )}
          {!project && <p className="empty-copy compact">Open a project to manage scenario assets.</p>}
        </div>
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
        onSelectPaintTile={onSelectPaintTile}
      />
      )}
      {showLibraryAssets && (
      <section className="tab-panel asset-authoring-panel">
        <div className="panel-header">
          <span>Library Assets</span>
          <b>{libraryAssets.length.toLocaleString()}</b>
        </div>
        <div className="library-asset-strip">
          {libraryAssets.slice(0, 120).map((asset) => (
            <LibraryAssetCard
              key={asset.id}
              asset={asset}
              desktopRuntime={desktopRuntime}
              workspaceDir={workspaceDir}
            />
          ))}
          {libraryAssets.length === 0 && <p className="empty-copy compact">Bundled libraries did not expose media assets.</p>}
        </div>
      </section>
      )}
      {showResourceForks && (
      <section className="tab-panel resource-browser">
        <div className="panel-header">
          <span>Resource Fork Inventory</span>
          <b>{resources.length.toLocaleString()}</b>
        </div>
        <div className="resource-type-grid">
          {resourceTypes.map((entity) => {
            const members = resourceMembersForType(project, entity.id);
            return (
              <button key={entity.id} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
                <strong>{String(entity.summary.type ?? entity.label)}</strong>
                <span>{members.length.toLocaleString()} resources</span>
                <small>{String(entity.summary.totalBytes ?? 0)} bytes</small>
              </button>
            );
          })}
        </div>
        {gaps.length > 0 && (
          <div className="lint-results compact">
            <section>
              <header>Resource Fallbacks</header>
              {gaps.slice(0, 8).map((gap) => (
                <button key={gap.entity.id} className="lint-issue warning" onClick={() => onSelectEntity(selectEntityFromId(gap.entity.id))}>
                  ! {gap.entity.label} uses {gap.reason}
                  <small>{gap.consumers.length.toLocaleString()} semantic consumers</small>
                </button>
              ))}
            </section>
          </div>
        )}
        <div className="resource-list">
          {resources.slice(0, 500).map((entity) => {
            const consumers = resourceConsumers(project, entity.id);
            return (
              <button key={entity.id} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
                <strong>{entity.label}</strong>
                <span>{resourceStatus(entity)} | {consumers.length.toLocaleString()} refs</span>
                <small>{entity.id}</small>
              </button>
            );
          })}
          {!project && <div className="entity-empty">Open a project to inspect resources.</div>}
        </div>
      </section>
      )}
      {showRenderAssets && (
      <section className="tab-panel atlas-browser">
        <div className="panel-header">
          <span>Tile Atlases</span>
          <b>{tileAtlases.length.toLocaleString()}</b>
        </div>
        <div className="asset-grid compact">
          {tileAtlases.map((asset) => (
            <article key={asset.id} className="asset-card">
              <div className="asset-swatch" style={{ background: tileColor(numberSummary(asset.summary.landlook)) }}>
                <span>{asset.editState === "blocked" ? "missing" : "ready"}</span>
              </div>
              <strong>{asset.label}</strong>
              <span>{semanticLabel(project, asset.id)}</span>
              <small>{asset.source}{asset.summary.pictId ? ` | PICT ${asset.summary.pictId}` : ""}</small>
              {asset.summary.imagePath != null && <small>{compactValue(asset.summary.imagePath)}</small>}
            </article>
          ))}
        </div>
      </section>
      )}
      </div>
      <aside className="tab-panel semantic-right">
        <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
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
  onSelectPaintTile
}: {
  project: Project | null;
  libraryAssets: LibraryAsset[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onImportAssets?: (files: File[], kind: ManagedAssetKind) => void;
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
      <div className="managed-asset-grid compact-assets">
        {authoredTiles.map((asset) => (
          <SpecialLandAssetCard
            key={asset.id}
            asset={asset}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            onSelectPaintTile={onSelectPaintTile}
          />
        ))}
        {project && authoredTiles.length === 0 && (
          <p className="empty-copy compact">Import a small image here to create a 32 x 32 cicn special land tile.</p>
        )}
        {!project && <p className="empty-copy compact">Open a project to author Special Land Tiles. Bundled examples remain read-only below.</p>}
      </div>
      {libraryTiles.length > 0 && (
        <>
          <div className="subsection-label">Read-only library examples</div>
          <div className="library-asset-strip compact-assets">
            {libraryTiles.slice(0, 48).map((asset) => (
              <LibraryAssetCard key={asset.id} asset={asset} desktopRuntime={desktopRuntime} workspaceDir={workspaceDir} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SpecialLandAssetCard({
  asset,
  desktopRuntime,
  projectDir,
  onSelectPaintTile
}: {
  asset: ManagedAsset;
  desktopRuntime: boolean;
  projectDir: string;
  onSelectPaintTile?: (tile: number) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
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
      <button className="btn btn-primary btn-xs" type="button" onClick={() => onSelectPaintTile?.(asset.resourceId)}>
        Select for painting
      </button>
    </article>
  );
}

function ManagedAssetCard({
  asset,
  desktopRuntime,
  projectDir,
  onUpdateAsset,
  onDeleteAsset
}: {
  asset: ManagedAsset;
  desktopRuntime: boolean;
  projectDir: string;
  onUpdateAsset?: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset?: (assetId: string) => void;
}) {
  const preview = useProjectPreview(asset.previewPath, desktopRuntime, projectDir);
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
      <button className="btn btn-danger btn-xs" type="button" onClick={() => onDeleteAsset?.(asset.id)}>
        <Trash2 size={12} /> Delete
      </button>
    </article>
  );
}

function LibraryAssetCard({ asset, desktopRuntime, workspaceDir }: { asset: LibraryAsset; desktopRuntime: boolean; workspaceDir: string }) {
  const preview = useLibraryPreview(asset, desktopRuntime, workspaceDir);
  return (
    <article className="managed-asset-card library">
      <AssetPreview kind={assetKind(asset.type)} label={asset.label} preview={preview} />
      <strong>{asset.label}</strong>
      <small>{asset.resourceType ?? asset.type} {asset.resourceId ?? ""}</small>
      <small>{formatBytes(asset.bytes)}</small>
    </article>
  );
}

function AssetPreview({ kind, label, preview }: { kind: ManagedAssetKind; label: string; preview: string | null }) {
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
      <span>{kind === "sound" ? "Metadata only" : "Unsupported preview"}</span>
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

function useLibraryPreview(asset: LibraryAsset, desktopRuntime: boolean, workspaceDir: string) {
  const [preview, setPreview] = useState<string | null>(asset.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!desktopRuntime) {
      loadBrowserBundledLibraryAssetPreview(asset)
        .then((url) => {
          if (!disposed) setPreview(url);
        })
        .catch(() => {
          if (!disposed) setPreview(asset.previewPath ?? null);
        });
      return () => {
        disposed = true;
      };
    }
    if (!workspaceDir) {
      setPreview(asset.previewPath ?? null);
      return;
    }
    invoke<DecodedResourcePreview>("inspect_library_asset_preview", { workspaceDir, source: asset.source, relativePath: asset.relativePath })
      .then((decoded) => {
        if (!disposed) setPreview(decoded.dataUrl ?? asset.previewPath ?? null);
      })
      .catch(() => {
        invoke<string>("load_library_asset_preview", { workspaceDir, source: asset.source, relativePath: asset.relativePath })
          .then((url) => {
            if (!disposed) setPreview(url);
          })
          .catch(() => {
            if (!disposed) setPreview(null);
          });
      });
    return () => {
      disposed = true;
    };
  }, [asset.id, asset.previewPath, asset.relativePath, asset.source, desktopRuntime, workspaceDir]);
  return preview;
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
