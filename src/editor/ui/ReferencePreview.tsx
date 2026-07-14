import { Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "./WorkbenchPrimitives";
import "./ReferencePreview.css";

type ReferencePreviewBase = {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  state?: "resolved" | "missing" | "unavailable";
};

export type ReferenceTextPreview = ReferencePreviewBase & {
  kind: "text";
  text: ReactNode;
};

export type ReferenceSummaryPreview = ReferencePreviewBase & {
  kind: "summary";
  summary: ReactNode;
};

export type ReferenceImagePreview = ReferencePreviewBase & {
  kind: "image";
  src: string | null;
  alt: string;
};

export type ReferenceAudioPreview = ReferencePreviewBase & {
  kind: "audio";
  src: string | null;
  onPlay?: () => void;
  playLabel?: ReactNode;
};

export type ReferenceCustomPreview = ReferencePreviewBase & {
  kind: "custom";
  content: ReactNode;
};

export type ReferenceMissingPreview = ReferencePreviewBase & {
  kind: "missing";
  body: ReactNode;
  state: "missing";
};

export type ReferencePreviewModel =
  | ReferenceTextPreview
  | ReferenceSummaryPreview
  | ReferenceImagePreview
  | ReferenceAudioPreview
  | ReferenceCustomPreview
  | ReferenceMissingPreview;

export type ReferencePreviewRenderer<TPreview extends ReferencePreviewModel = ReferencePreviewModel> = (
  preview: TPreview
) => ReactNode;

export type ReferencePreviewRendererRegistry = Partial<{
  [TKind in ReferencePreviewModel["kind"]]: ReferencePreviewRenderer<Extract<ReferencePreviewModel, { kind: TKind }>>;
}>;

type CompleteReferencePreviewRendererRegistry = {
  [TKind in ReferencePreviewModel["kind"]]: ReferencePreviewRenderer<Extract<ReferencePreviewModel, { kind: TKind }>>;
};

export type ReferencePreviewProps = {
  preview: ReferencePreviewModel;
  renderers?: ReferencePreviewRendererRegistry;
  className?: string;
};

export const DEFAULT_REFERENCE_PREVIEW_RENDERERS: CompleteReferencePreviewRendererRegistry = {
  text: (preview) => <p>{preview.text}</p>,
  summary: (preview) => <p>{preview.summary}</p>,
  image: (preview) => preview.src
    ? <img src={preview.src} alt={preview.alt} />
    : <small>No image preview is available for this reference.</small>,
  audio: (preview) => (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={!preview.src || !preview.onPlay}
      title={preview.src ? "Play this sound preview." : "No playable preview is available for this sound."}
      onClick={preview.onPlay}
    >
      <Volume2 size={13} /> {preview.playLabel ?? "Play"}
    </button>
  ),
  custom: (preview) => preview.content,
  missing: (preview) => <EmptyState compact title={preview.title} body={preview.body} />
};

export function ReferencePreview({ preview, renderers, className }: ReferencePreviewProps) {
  const renderer = resolveReferencePreviewRenderer(preview, renderers);
  const state = preview.state ?? "resolved";
  return (
    <section
      className={["workbench-reference-preview", `is-${state}`, className].filter(Boolean).join(" ")}
      data-reference-preview-key={preview.key}
      data-reference-preview-kind={preview.kind}
    >
      {preview.kind !== "missing" && (
        <header>
          <strong>{preview.title}</strong>
          {preview.detail && <small>{preview.detail}</small>}
        </header>
      )}
      <div className="workbench-reference-preview-content">{renderer(preview)}</div>
    </section>
  );
}

function resolveReferencePreviewRenderer(
  preview: ReferencePreviewModel,
  renderers?: ReferencePreviewRendererRegistry
): ReferencePreviewRenderer {
  const renderer = renderers?.[preview.kind] ?? DEFAULT_REFERENCE_PREVIEW_RENDERERS[preview.kind];
  return renderer as ReferencePreviewRenderer;
}
