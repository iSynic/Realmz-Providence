import { ResourcePreviewStatus as PreviewStatus } from "../types";

export function ResourcePreviewBadge({ status }: { status: PreviewStatus | "unknown" }) {
  return <span className={`resource-preview-badge ${previewTone(status)}`}>{statusLabel(status)}</span>;
}

export function ResourcePreviewDiagnostics({ diagnostics }: { diagnostics: string[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="resource-preview-diagnostics">
      {diagnostics.slice(0, 3).map((diagnostic) => (
        <small key={diagnostic}>{diagnostic}</small>
      ))}
    </div>
  );
}

function statusLabel(status: PreviewStatus | "unknown") {
  if (status === "preview-ready") return "preview";
  if (status === "text-ready") return "text";
  if (status === "metadata-only") return "metadata";
  if (status === "unsupported-variant") return "unsupported";
  return status;
}

function previewTone(status: PreviewStatus | "unknown") {
  if (status === "preview-ready" || status === "playable" || status === "text-ready") return "ready";
  if (status === "metadata-only" || status === "unknown") return "neutral";
  return "warning";
}
