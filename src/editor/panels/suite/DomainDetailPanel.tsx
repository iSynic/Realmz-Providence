import { useEffect, useMemo, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { ENTITY_TYPE_LABELS } from "../../constants";
import type { DirectRecordRow } from "../../directRecordIndex";
import { isDraftEntity } from "../../libraryDrafts";
import type {
  LibraryAsset,
  LibraryCatalog,
  LibraryEntity,
  ManagedAssetKind,
  SemanticEntity
} from "../../types";
import { ScrollArea } from "../../ui";
import type { DomainListEntry } from "./suiteDomainRouting";

export function DomainDetailPanel({
  detail,
  catalog,
  onUpdateDraft
}: {
  detail: SemanticEntity | LibraryEntity | DirectRecordRow | { id: string; label: string; type: string; editState: string; confidence: string; summary: Record<string, unknown>; source?: string; recordRef?: string | null; byteRange?: unknown } | null;
  catalog: LibraryCatalog | null;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
}) {
  const asset = useMemo(() => findLibraryAssetForDetail(detail, catalog), [catalog, detail]);
  const preview = useLibraryAssetPreview(asset);
  if (!detail) {
    return (
      <aside className="domain-detail-panel">
        <header>
          <span>Selection</span>
        </header>
        <ScrollArea className="domain-detail-scroll" aria-label="Selection detail">
          <p>Select an entry or create a new draft to inspect its content, decoded fields, and export state.</p>
        </ScrollArea>
      </aside>
    );
  }
  const source = "source" in detail ? detail.source : null;
  const recordRef = "recordRef" in detail ? detail.recordRef : null;
  const summary = typeof detail.summary === "object" ? detail.summary ?? {} : { summary: detail.summary };
  const canEditDraft = isDraftEntity(detail.id) && onUpdateDraft;
  const sourceLabel = source ? catalog?.sources.find((candidate) => candidate.id === source)?.relativePath ?? source : "none";
  const contentFacts = getContentFacts(detail);
  return (
    <aside className="domain-detail-panel">
      <header>
        <span>{ENTITY_TYPE_LABELS[detail.type] ?? detail.type}</span>
        <b>{"editState" in detail ? detail.editState : "direct"}</b>
      </header>
      <ScrollArea className="domain-detail-scroll" aria-label="Domain detail">
        {canEditDraft ? (
          <label className="domain-field">
            <span>Name</span>
            <input
              defaultValue={detail.label}
              onBlur={(event) => {
                const label = event.currentTarget.value.trim();
                if (label && label !== detail.label) onUpdateDraft(detail.id, { label });
              }}
            />
          </label>
        ) : (
          <h2>{detail.label}</h2>
        )}
        <p className="domain-detail-subtitle">{entitySubtitle(detail)}</p>
        {asset && <DomainAssetPreview asset={asset} preview={preview} />}
        <section className="domain-summary">
          <header>Content</header>
          {contentFacts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <code>{fact.value}</code>
            </div>
          ))}
        </section>
        {canEditDraft && (
          <label className="domain-field">
            <span>Notes</span>
            <textarea
              defaultValue={String(summary.notes ?? "")}
              onBlur={(event) => {
                const notes = event.currentTarget.value;
                if (notes !== String(summary.notes ?? "")) onUpdateDraft(detail.id, { notes });
              }}
            />
          </label>
        )}
        <section className="domain-summary">
          <header>Decoded Fields</header>
          {Object.entries(summary).length ? (
            Object.entries(summary).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <code>{formatSummaryValue(value)}</code>
              </div>
            ))
          ) : (
            <p>No decoded fields yet.</p>
          )}
        </section>
        <section className="domain-summary domain-technical-summary">
          <header>Technical</header>
          <div>
            <span>ID</span>
            <code>{detail.id}</code>
          </div>
          <div>
            <span>Source</span>
            <code>{sourceLabel}</code>
          </div>
          <div>
            <span>Record</span>
            <code>{recordRef ?? "none"}</code>
          </div>
          <div>
            <span>Status</span>
            <code>{userFacingConfidence("confidence" in detail ? detail.confidence : "source-backed")}</code>
          </div>
        </section>
      </ScrollArea>
    </aside>
  );
}

function DomainAssetPreview({ asset, preview }: { asset: LibraryAsset; preview: string | null }) {
  const kind = assetKind(asset.type);
  return (
    <section className="domain-asset-preview">
      {preview && kind === "sound" ? (
        <audio src={preview} controls preload="metadata" />
      ) : preview && kind !== "sound" ? (
        <img src={preview} alt={asset.label} />
      ) : (
        <div className="domain-preview-empty">Preview unavailable for this resource variant.</div>
      )}
      <div>
        <strong>{asset.label}</strong>
        <small>{asset.resourceType ?? asset.type} {asset.resourceId ?? ""} | {formatBytes(asset.bytes)}</small>
      </div>
    </section>
  );
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}

function useLibraryAssetPreview(asset: LibraryAsset | null) {
  const [preview, setPreview] = useState<string | null>(asset?.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!asset) {
      setPreview(null);
      return;
    }
    setPreview(asset.previewPath ?? null);
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
  }, [asset]);
  return preview;
}

function findLibraryAssetForDetail(detail: { id: string; label?: string; type: string; summary: Record<string, unknown> | string; source?: string } | null, catalog: LibraryCatalog | null) {
  if (!detail || !catalog) return null;
  const summary = typeof detail.summary === "object" ? detail.summary : {};
  const resourceType = typeof summary.type === "string" ? summary.type : null;
  const resourceId = typeof summary.resourceId === "number" ? summary.resourceId : null;
  if (resourceType && resourceId !== null) {
    return catalog.assets.find((asset) =>
      asset.resourceType === resourceType &&
      asset.resourceId === resourceId &&
      (!detail.source || asset.source === detail.source)
    ) ?? null;
  }
  return catalog.assets.find((asset) => asset.id === detail.id || (detail.label != null && asset.label === detail.label)) ?? null;
}

function assetKind(type: string): ManagedAssetKind {
  if (type === "sound") return "sound";
  if (type === "music") return "music";
  if (type === "icon" || type.includes("icon")) return "icon";
  if (type === "picture") return "picture";
  if (type === "text") return "text";
  return "other";
}

function formatSummaryValue(value: unknown) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function entitySubtitle(entity: SemanticEntity | LibraryEntity | DomainListEntry | { type: string; editState?: string; summary: Record<string, unknown> | string }) {
  const summary = typeof entity.summary === "object" ? entity.summary ?? {} : { textPreview: entity.summary };
  const editState = "editState" in entity ? entity.editState : "direct";
  if (summary.draft) return `draft | ${editState}`;
  if (summary.resourceId !== undefined) {
    const resource = `${String(summary.type ?? "resource").trim()} ${summary.resourceId}`;
    const size = summary.bytes !== undefined ? ` | ${formatBytes(Number(summary.bytes))}` : "";
    const family = summary.family ? ` | ${summary.family}` : "";
    return `${resource}${size}${family}`;
  }
  if (summary.count !== undefined && summary.totalBytes !== undefined) {
    return `${Number(summary.count).toLocaleString()} entries | ${formatBytes(Number(summary.totalBytes))}`;
  }
  if (summary.index !== undefined) {
    const bytes = summary.recordBytes !== undefined ? ` | ${formatBytes(Number(summary.recordBytes))}` : "";
    return `entry ${summary.index}${bytes} | ${editState}`;
  }
  if (summary.family) return `${summary.family} | ${editState}`;
  if (summary.textPreview) return `${summary.textPreview} | ${editState}`;
  return `${ENTITY_TYPE_LABELS[entity.type] ?? entity.type} | ${editState}`;
}

function getContentFacts(detail: { type: string; editState?: string; summary: Record<string, unknown> | string }) {
  const summary = typeof detail.summary === "object" ? detail.summary ?? {} : { textPreview: detail.summary };
  const facts: Array<{ label: string; value: string }> = [
    { label: "Kind", value: ENTITY_TYPE_LABELS[detail.type] ?? detail.type },
    { label: "State", value: detail.editState ?? "direct" }
  ];
  if (summary.resourceId !== undefined) facts.push({ label: "Resource", value: `${String(summary.type ?? "resource").trim()} ${summary.resourceId}` });
  if (summary.index !== undefined) facts.push({ label: "Entry", value: String(summary.index) });
  if (summary.family) facts.push({ label: "Family", value: String(summary.family) });
  if (summary.bytes !== undefined) facts.push({ label: "Size", value: formatBytes(Number(summary.bytes)) });
  if (summary.recordBytes !== undefined) facts.push({ label: "Record Size", value: formatBytes(Number(summary.recordBytes)) });
  if (summary.stringCount !== undefined) facts.push({ label: "Strings", value: String(summary.stringCount) });
  if (summary.iconBytes !== undefined) facts.push({ label: "Icon Bytes", value: formatBytes(Number(summary.iconBytes)) });
  if (summary.frame) facts.push({ label: "Frame", value: formatSummaryValue(summary.frame) });
  if (summary.exportState) facts.push({ label: "Export", value: String(summary.exportState) });
  if (summary.textPreview) facts.push({ label: "Preview", value: String(summary.textPreview) });
  return facts;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < 1024) return `${value.toLocaleString()} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
