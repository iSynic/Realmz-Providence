import { ResourcePreviewDiagnostic, ResourcePreviewStatus as PreviewStatus } from "../types";

export function ResourcePreviewBadge({ status }: { status: PreviewStatus | "unknown" }) {
  return <span className={`resource-preview-badge ${previewTone(status)}`}>{statusLabel(status)}</span>;
}

export function ResourcePreviewDiagnostics({ diagnostics }: { diagnostics: Array<string | ResourcePreviewDiagnostic> }) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="resource-preview-diagnostics">
      {diagnostics.slice(0, 3).map((diagnostic) => {
        const key = typeof diagnostic === "string" ? diagnostic : `${diagnostic.code}:${diagnostic.message}`;
        return (
          <small key={key}>
            {typeof diagnostic === "string" ? diagnostic : diagnosticMessage(diagnostic)}
          </small>
        );
      })}
    </div>
  );
}

function statusLabel(status: PreviewStatus | "unknown") {
  if (status === "preview-ready") return "Preview";
  if (status === "playable") return "Playable";
  if (status === "text-ready") return "Readable";
  if (status === "metadata-only") return "Info Only";
  if (status === "missing-fallback") return "Missing";
  if (status === "unsupported-variant") return "Cannot Preview";
  if (status === "malformed") return "Problem";
  return "Unknown";
}

function previewTone(status: PreviewStatus | "unknown") {
  if (status === "preview-ready" || status === "playable" || status === "text-ready") return "ready";
  if (status === "metadata-only" || status === "unknown") return "neutral";
  return "warning";
}

function diagnosticMessage(diagnostic: ResourcePreviewDiagnostic) {
  const parts = [diagnostic.message];
  if (diagnostic.opcode) parts.push(`opcode ${diagnostic.opcode}`);
  if (diagnostic.offset != null) parts.push(`offset ${diagnostic.offset}`);
  if (diagnostic.variant) parts.push(diagnostic.variant);
  if (diagnostic.hint) parts.push(diagnostic.hint);
  return parts.join(" | ");
}
