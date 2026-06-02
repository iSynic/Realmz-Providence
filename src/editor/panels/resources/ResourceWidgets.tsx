import { invoke } from "@tauri-apps/api/core";
import { FileText, ImageIcon, Music, Upload, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DecodedResourcePreview, LibraryAsset, ManagedAsset, ManagedAssetKind, Project, ResourcePreviewDiagnostic, ResourcePreviewStatus, SelectedEntity, SemanticEntity } from "../../types";
import { compactValue, selectEntityFromId } from "../../utils";
import { resourceConsumers } from "../../semanticGraph";
import { resourceUsageLinks } from "../../contentLinks";
import { ResourcePreviewBadge, ResourcePreviewDiagnostics } from "../../components/ResourcePreviewStatus";
import { inspectBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { FloatingWorkbenchPanel, ScrollArea } from "../../ui";
import { renderListKey } from "../../renderKeys";
import { ResourceExportScope, isMapPlaceableLibraryAsset, managedAssetKindForLibrary, resourceExportScope, resourceExportScopeLabel, resourceOrigin, resourceOriginLabel, resourceRole } from "../../resourceResolver";
import {
  MediaAssetImportOptions,
  SCENARIO_PICTURE_MAX_ID,
  SCENARIO_PICTURE_MIN_ID,
  SCENARIO_SOUND_MAX_ID,
  SCENARIO_SOUND_MIN_ID,
  SCENARIO_SPLASH_PICTURE_ID
} from "../../mediaAssets";
import { AssetImportBar } from "./AssetImportDialog";

export type AssetSection = "project" | "realmz" | "divinity" | "records" | "advanced";
export const LIBRARY_PAGE_SIZE = 20;

export const ASSET_SECTIONS: Array<{ id: AssetSection; editor: string; label: string }> = [
  { id: "project", editor: "project-assets", label: "Scenario Assets" },
  { id: "realmz", editor: "library-assets", label: "Reference Libraries" },
  { id: "divinity", editor: "divinity-reference", label: "Divinity Reference" },
  { id: "records", editor: "decoded-records", label: "Decoded Records" },
  { id: "advanced", editor: "resource-forks", label: "Advanced Inventory" }
];

export function assetSectionFromEditor(activeEditor: string): AssetSection {
  if (activeEditor === "decoded-records") return "records";
  if (activeEditor === "library-assets") return "realmz";
  if (activeEditor === "divinity-reference") return "divinity";
  if (activeEditor === "resource-forks" || activeEditor === "render-assets") return "advanced";
  return "project";
}

export function assetKindFilterFromEditor(activeEditor: string): ManagedAssetKind | "all" {
  if (activeEditor === "pictures") return "picture";
  if (activeEditor === "sounds") return "sound";
  if (activeEditor === "icons") return "icon";
  if (activeEditor === "special-land") return "special-land-tile";
  return "all";
}

export function assetSectionTitle(section: AssetSection) {
  if (section === "realmz") return "Reference Only - Built Into Realmz";
  if (section === "divinity") return "Reference Only - Divinity";
  if (section === "advanced") return "Advanced Raw Resources";
  return "Ships With This Scenario";
}

export function assetMatchesSection(asset: ManagedAsset, section: AssetSection) {
  return section === "project";
}

export function libraryAssetMatchesSection(asset: LibraryAsset, section: AssetSection, showUiReference = false) {
  if (section !== "realmz" && section !== "divinity") return false;
  const origin = resourceOrigin(asset);
  if (section === "realmz") return origin === "realmz-library";
  return origin === "divinity-reference" || (showUiReference && origin === "ui-reference");
}

export function assetMatchesKind(kind: ManagedAssetKind, filter: ManagedAssetKind | "all") {
  return filter === "all" || kind === filter;
}

export function libraryAssetMatchesKind(asset: LibraryAsset, filter: ManagedAssetKind | "all") {
  if (filter === "all") return true;
  if (filter === "special-land-tile") return managedAssetKindForLibrary(asset) === "special-land-tile" || isMapPlaceableLibraryAsset(asset);
  return managedAssetKindForLibrary(asset) === filter;
}

export function assetAuthoringGuidance(section: AssetSection, kindFilter: ManagedAssetKind | "all") {
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

export { AssetImportBar } from "./AssetImportDialog";

function kindLabel(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return "Special Land Tile / cicn";
  if (kind === "picture") return "Picture / PICT";
  if (kind === "icon") return "Icon / cicn";
  if (kind === "sound") return "Sound / snd";
  return kind;
}

export function SpecialLandTilePanel({
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

export function SpecialLandAssetCard({
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

export function ManagedAssetCard({
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

export function projectAssetRangeNotes(asset: ManagedAsset) {
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

export function PreviewStatusFilters({
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

export function previewFilterLabel(status: ResourcePreviewStatus | "all") {
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

export function LibraryAssetCard({
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

export function AssetPagination({
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

export function AssetPreview({
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

export type ResourcePreviewItem =
  | { type: "managed"; asset: ManagedAsset; preview: string | null; usages: ReturnType<typeof resourceUsageLinks> }
  | { type: "library"; asset: LibraryAsset; preview: AssetPreviewState; usages: ReturnType<typeof resourceUsageLinks> }
  | { type: "resource"; entity: SemanticEntity; consumers: ReturnType<typeof resourceConsumers> };

export function ResourceScopeBadge({ scope }: { scope: ResourceExportScope }) {
  return <span className={`resource-scope-badge ${scope}`}>{resourceExportScopeLabel(scope)}</span>;
}

export function ResourcePreviewWindow({
  item,
  desktopRuntime,
  projectDir,
  onClose,
  onSelectEntity
}: {
  item: ResourcePreviewItem;
  desktopRuntime: boolean;
  projectDir: string;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const title = item.type === "resource" ? item.entity.label : item.asset.label;
  const scope = item.type === "managed"
    ? resourceExportScope(item.asset)
    : item.type === "library"
      ? resourceExportScope(item.asset)
      : item.entity.summary.scenarioSupplied === true
        ? "ships-with-scenario"
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
          <ManagedResourceDetail
            item={item}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            onSelectEntity={onSelectEntity}
          />
        )}
        {item.type === "library" && (
          <>
            {managedAssetKindForLibrary(item.asset) === "text" && libraryPreviewText(item.preview) ? (
              <pre className="resource-detail-text" aria-label={item.asset.label}>{libraryPreviewText(item.preview)}</pre>
            ) : (
              <ResourcePreviewMedia kind={managedAssetKindForLibrary(item.asset)} preview={item.preview.dataUrl} label={item.asset.label} />
            )}
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
          <ScenarioResourceDetail
            item={item}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            onSelectEntity={onSelectEntity}
          />
        )}
      </div>
    </FloatingWorkbenchPanel>
  );
}

function ScenarioResourceDetail({
  item,
  desktopRuntime,
  projectDir,
  onSelectEntity
}: {
  item: Extract<ResourcePreviewItem, { type: "resource" }>;
  desktopRuntime: boolean;
  projectDir: string;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const rawPreview = resourcePreviewDataUrl(item.entity.summary);
  const preview = useProjectPreview(rawPreview ?? "", desktopRuntime, projectDir);
  return (
    <>
      {preview ? (
        <ResourcePreviewMedia
          kind={resourceKindFromSummary(item.entity.summary)}
          preview={preview}
          label={item.entity.label}
        />
      ) : resourceSummaryText(item.entity.summary) ? (
        <pre className="resource-detail-text">{resourceSummaryText(item.entity.summary)}</pre>
      ) : (
        <ResourcePreviewMedia kind={resourceKindFromSummary(item.entity.summary)} preview={null} label={item.entity.label} />
      )}
      <ResourceFactGrid rows={[
        ["ID", item.entity.id],
        ["Type", item.entity.type],
        ["State", resourceStatus(item.entity)],
        ["Source", item.entity.source],
        ["Preview", previewStatusLabel(item.entity.summary)]
      ]} />
      {resourcePreviewSummaryRows(item.entity.summary).length > 0 && <ResourceFactGrid title="Preview Details" rows={resourcePreviewSummaryRows(item.entity.summary)} />}
      <ResourcePreviewDiagnostics diagnostics={resourcePreviewDiagnostics(item.entity.summary)} />
      <ResourceFactGrid title="Decoded Fields" rows={resourceDecodedRows(item.entity.summary)} />
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
  );
}

export function ManagedResourceDetail({
  item,
  desktopRuntime,
  projectDir,
  onSelectEntity
}: {
  item: Extract<ResourcePreviewItem, { type: "managed" }>;
  desktopRuntime: boolean;
  projectDir: string;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const originalPreview = useProjectPreview(item.asset.originalPath, desktopRuntime, projectDir);
  const isSound = item.asset.kind === "sound";
  const conversionRows = managedConversionRows(item.asset);
  return (
    <>
      <div className="resource-preview-comparison">
        <div className="resource-preview-panel">
          <header>
            <strong>{isSound ? "Realmz Sound Preview" : "Realmz-Ready Output"}</strong>
            <span>{managedOutputSummary(item.asset)}</span>
          </header>
          <ResourcePreviewMedia kind={item.asset.kind} preview={item.preview} label={`${item.asset.label} converted preview`} />
        </div>
        <div className="resource-preview-panel">
          <header>
            <strong>Original Source</strong>
            <span>{managedSourceSummary(item.asset)}</span>
          </header>
          <ResourcePreviewMedia kind={item.asset.kind} preview={originalPreview} label={`${item.asset.label} original source`} />
        </div>
      </div>
      <ResourceFactGrid rows={[
        ["Resource", `${item.asset.resourceType} ${item.asset.resourceId}`],
        ["Kind", kindLabel(item.asset.kind)],
        ["Export", assetExportLabel(item.asset.exportState)],
        ["Output", managedOutputSummary(item.asset)],
        ["Original", managedSourceSummary(item.asset)],
        ["Original Bytes", formatBytes(item.asset.bytes)]
      ]} />
      {conversionRows.length > 0 && <ResourceFactGrid title="Import Conversion" rows={conversionRows} />}
      <UsageLinks usages={item.usages} onSelectEntity={onSelectEntity} />
    </>
  );
}

export function ResourcePreviewMedia({ kind, preview, label }: { kind: ManagedAssetKind; preview: string | null; label: string }) {
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  useEffect(() => setFailedPreview(null), [preview]);
  const usablePreview = preview && preview !== failedPreview ? preview : null;
  if (usablePreview && kind === "sound") return <audio className="resource-detail-audio" src={usablePreview} controls preload="metadata" />;
  if (usablePreview && kind === "text") {
    const text = decodeTextDataUrl(usablePreview);
    if (text != null) return <pre className="resource-detail-text" aria-label={label}>{text}</pre>;
  }
  if (usablePreview) return <img className="resource-detail-image" src={usablePreview} alt={label} onError={() => setFailedPreview(usablePreview)} />;
  return (
    <div className="resource-detail-missing">
      {kind === "sound" ? <Music size={28} /> : kind === "text" ? <FileText size={28} /> : <ImageIcon size={28} />}
      <span>{kind === "text" ? "No readable text available" : "No preview available"}</span>
    </div>
  );
}

function decodeTextDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:text/")) return null;
  const metadata = dataUrl.slice(0, comma).toLowerCase();
  const payload = dataUrl.slice(comma + 1);
  try {
    if (metadata.includes(";base64")) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function libraryPreviewText(preview: AssetPreviewState) {
  if (typeof preview.summary.text === "string" && preview.summary.text.trim()) return preview.summary.text;
  if (typeof preview.summary.textPreview === "string" && preview.summary.textPreview.trim()) return preview.summary.textPreview;
  if (typeof preview.summary.preview === "string" && preview.summary.preview.trim()) return preview.summary.preview;
  return "";
}

function resourceSummaryText(summary: Record<string, unknown>) {
  const preview = resourcePreviewDataUrl(summary);
  if (preview?.startsWith("data:text/")) {
    const decoded = decodeTextDataUrl(preview);
    if (decoded?.trim()) return decoded;
  }
  if (typeof summary.text === "string" && summary.text.trim()) return summary.text;
  if (typeof summary.textPreview === "string" && summary.textPreview.trim()) return summary.textPreview;
  return "";
}

function resourceKindFromSummary(summary: Record<string, unknown>): ManagedAssetKind {
  const resourceType = typeof summary.resourceType === "string" ? summary.resourceType : typeof summary.type === "string" ? summary.type : "";
  const normalized = resourceType.trim();
  if (normalized === "PICT") return "picture";
  if (normalized === "cicn") return "icon";
  if (normalized === "snd") return "sound";
  if (normalized === "TEXT" || normalized === "STR#") return "text";
  return "other";
}

function resourcePreviewDataUrl(summary: Record<string, unknown>) {
  return typeof summary.previewDataUrl === "string" && summary.previewDataUrl ? summary.previewDataUrl : null;
}

function previewStatusLabel(summary: Record<string, unknown>) {
  const status = typeof summary.previewStatus === "string" ? summary.previewStatus as ResourcePreviewStatus : null;
  return status ? previewFilterLabel(status) : "Info Only";
}

function resourcePreviewSummaryRows(summary: Record<string, unknown>) {
  const value = summary.previewSummary;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, compactValue(entry)] as [string, string]);
}

function resourcePreviewDiagnostics(summary: Record<string, unknown>): ResourcePreviewDiagnostic[] {
  const diagnostics = Array.isArray(summary.previewDiagnostics) ? summary.previewDiagnostics : [];
  return diagnostics
    .filter((entry): entry is string | ResourcePreviewDiagnostic =>
      (typeof entry === "string" && entry.trim().length > 0) ||
      (typeof entry === "object" && entry !== null && "message" in entry && typeof entry.message === "string" && entry.message.trim().length > 0)
    )
    .map((entry) => typeof entry === "string"
      ? { severity: "warning", code: "resource.preview", message: entry, decoder: "resource-preview" }
      : entry);
}

function resourceDecodedRows(summary: Record<string, unknown>) {
  const hidden = new Set(["preview", "previewDataUrl", "previewDiagnostics", "previewSummary"]);
  return Object.entries(summary)
    .filter(([key]) => !hidden.has(key))
    .map(([key, value]) => [key, compactValue(value)] as [string, string]);
}

export function managedOutputSummary(asset: ManagedAsset) {
  if (asset.width && asset.height) return `${asset.width} x ${asset.height}`;
  if (asset.durationMs) return `${(asset.durationMs / 1000).toFixed(1)}s @ ${asset.sampleRate ?? "?"} Hz`;
  const finalWidth = asset.conversion?.finalWidth ?? null;
  const finalHeight = asset.conversion?.finalHeight ?? null;
  if (finalWidth && finalHeight) return `${finalWidth} x ${finalHeight}`;
  return formatBytes(asset.bytes);
}

export function managedSourceSummary(asset: ManagedAsset) {
  const conversion = asset.conversion;
  if (conversion?.sourceWidth && conversion.sourceHeight) return `${conversion.sourceWidth} x ${conversion.sourceHeight}`;
  if (conversion?.sourceDurationMs) {
    const rate = conversion.sourceSampleRate ? ` @ ${conversion.sourceSampleRate} Hz` : "";
    const channels = conversion.sourceChannels ? `, ${conversion.sourceChannels} channel${conversion.sourceChannels === 1 ? "" : "s"}` : "";
    return `${(conversion.sourceDurationMs / 1000).toFixed(1)}s${rate}${channels}`;
  }
  return asset.fileName || "imported source";
}

export function managedConversionRows(asset: ManagedAsset): Array<[string, string]> {
  const conversion = asset.conversion;
  if (!conversion) return [];
  const rows: Array<[string, string]> = [];
  rows.push(["Target", importTargetLabel(conversion.target)]);
  if (conversion.sourceWidth && conversion.sourceHeight) rows.push(["Source Size", `${conversion.sourceWidth} x ${conversion.sourceHeight}`]);
  if (conversion.finalWidth && conversion.finalHeight) rows.push(["Output Size", `${conversion.finalWidth} x ${conversion.finalHeight}`]);
  if (conversion.sourceDurationMs) rows.push(["Source Duration", `${(conversion.sourceDurationMs / 1000).toFixed(1)}s`]);
  if (conversion.sourceSampleRate) rows.push(["Source Sample Rate", `${conversion.sourceSampleRate} Hz`]);
  if (conversion.sourceChannels) rows.push(["Source Channels", String(conversion.sourceChannels)]);
  if (conversion.fitMode) rows.push(["Fit", titleCase(conversion.fitMode)]);
  if (conversion.scaleMode) rows.push(["Scale", titleCase(conversion.scaleMode)]);
  if (conversion.matte) rows.push(["Matte", titleCase(conversion.matte)]);
  if (conversion.ditherMode) rows.push(["Dither", conversion.ditherMode === "floyd-steinberg" ? "Floyd-Steinberg" : "None"]);
  if (conversion.warnings.length > 0) rows.push(["Warnings", conversion.warnings.join("; ")]);
  return rows;
}

export function importTargetLabel(target: NonNullable<ManagedAsset["conversion"]>["target"]) {
  if (target === "scenario-picture") return "Scenario Picture";
  if (target === "custom-landlook-atlas") return "Custom Landlook Atlas";
  if (target === "special-land-tile") return "Special Land Tile";
  if (target === "icon") return "Icon";
  if (target === "sound") return "Sound";
  return target;
}

export function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part)
    .join(" ");
}

export function ResourceFactGrid({ title, rows }: { title?: string; rows: Array<[string, string]> }) {
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

export function UsageLinks({ usages, onSelectEntity }: { usages: ReturnType<typeof resourceUsageLinks>; onSelectEntity: (entity: SelectedEntity) => void }) {
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

export function roleLabel(role: ReturnType<typeof resourceRole>) {
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

export function useProjectPreview(path: string, desktopRuntime: boolean, projectDir: string) {
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

export function initialPreviewState(dataUrl: string | null): AssetPreviewState {
  return {
    dataUrl,
    status: dataUrl ? "preview-ready" : "metadata-only",
    summary: {},
    diagnostics: []
  };
}

export function useLibraryPreview(asset: LibraryAsset, desktopRuntime: boolean, workspaceDir: string) {
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

export function estimatedPreviewStatus(asset: LibraryAsset): ResourcePreviewStatus {
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

export function previewFallbackLabel(kind: ManagedAssetKind, status: ResourcePreviewStatus | "unknown") {
  if (status === "missing-fallback") return "Missing fallback";
  if (status === "malformed") return "Malformed resource";
  if (status === "unsupported-variant") return "Cannot preview";
  if (status === "metadata-only") return "Info only";
  if (kind === "sound") return "Not playable yet";
  return "No preview";
}

export function assetExportLabel(state: ManagedAsset["exportState"]) {
  if (state === "ready") return "Exports with scenario";
  if (state === "preview-only") return "Preview only";
  if (state === "blocked") return "Needs attention";
  return "Project asset";
}

export function diagnosticPreviewText(diagnostic: string | ResourcePreviewDiagnostic) {
  if (typeof diagnostic === "string") return diagnostic;
  const bits = [diagnostic.message];
  if (diagnostic.opcode) bits.push(diagnostic.opcode);
  if (diagnostic.offset != null) bits.push(`offset ${diagnostic.offset}`);
  if (diagnostic.variant) bits.push(diagnostic.variant);
  return bits.join(" | ");
}

export function previewDiagnostic(code: string, message: string, decoder: string): ResourcePreviewDiagnostic {
  return { severity: "warning", code, message, decoder };
}

export function assetKind(type: string): ManagedAssetKind {
  if (type === "sound") return "sound";
  if (type === "special-land-tile") return "special-land-tile";
  if (type === "icon" || type.includes("icon")) return "icon";
  if (type === "picture") return "picture";
  if (type === "text" || type.includes("text") || type.includes("string")) return "text";
  return "other";
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < 1024) return `${value.toLocaleString()} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function resourceStatus(entity: { type: string; editState: string; summary: Record<string, unknown> }) {
  if (entity.summary.sharedFallback) return "shared fallback";
  if (entity.summary.referenceOnly) return "reference only";
  if (entity.type === "runtime-cache") return "generated cache";
  if (entity.type === "asset-fallback") return "missing asset";
  return entity.editState;
}

export function numberSummary(value: unknown) {
  return typeof value === "number" ? value : 0;
}
