import { Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ManagedAssetKind } from "../../types";
import {
  assetTargetForKind,
  fileToMediaAssetRequest,
  inspectMediaAssetSource,
  MediaAssetImportOptions,
  MediaAssetSourceInfo,
  SCENARIO_PICTURE_MIN_ID,
  SCENARIO_SOUND_MIN_ID
} from "../../mediaAssets";

export function AssetImportBar({
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
  const [sourcePreviewDataUrl, setSourcePreviewDataUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState("");
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const accept = fixedKind ? (fixedKind === "sound" ? "audio/*" : "image/*") : "image/*,audio/*";
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
    const nextKind = fixedKind ?? defaultImportKindForFile(first);
    setKind(nextKind);
    setPendingFiles(files);
    setSourceInfo(null);
    setSourcePreviewDataUrl(null);
    setPreviewDataUrl(null);
    setPreviewSummary("Preparing preview...");
    setPreviewWarnings([]);
    setFitMode("fit");
    setScaleMode(isLikelyPixelArt(first, nextKind) ? "crisp" : "smooth");
    setMatte(nextKind === "picture" ? "white" : "transparent");
    setDitherMode(nextKind === "picture" ? "floyd-steinberg" : "none");
  };
  const pendingImportKinds = importKindsForFile(pendingFiles[0], fixedKind);
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
        setSourcePreviewDataUrl(`data:${request.mimeType};base64,${request.originalBase64}`);
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
        setSourcePreviewDataUrl(null);
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
      {fixedKind && <span className="asset-import-fixed-kind">{kindLabel(fixedKind)}</span>}
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
              <div className="asset-import-preview-comparison">
                <div className="asset-import-preview">
                  <strong>Realmz-ready output</strong>
                  {previewDataUrl && activeKind === "sound" && <audio controls src={previewDataUrl} />}
                  {previewDataUrl && activeKind !== "sound" && <img src={previewDataUrl} alt="Converted asset preview" />}
                  {!previewDataUrl && <span>{previewSummary}</span>}
                </div>
                <div className="asset-import-preview">
                  <strong>Original source</strong>
                  {sourcePreviewDataUrl && activeKind === "sound" && <audio controls src={sourcePreviewDataUrl} />}
                  {sourcePreviewDataUrl && activeKind !== "sound" && <img src={sourcePreviewDataUrl} alt="Original source preview" />}
                  {!sourcePreviewDataUrl && <span>{sourceInfo ? sourceSummary(sourceInfo) : "Reading..."}</span>}
                </div>
              </div>
              <div className="asset-import-settings">
                <label>
                  Import As
                  <select
                    value={activeKind}
                    disabled={Boolean(fixedKind)}
                    onChange={(event) => {
                      const nextKind = event.currentTarget.value as ManagedAssetKind;
                      setKind(nextKind);
                      setFitMode("fit");
                      setScaleMode(isLikelyPixelArt(pendingFiles[0], nextKind) ? "crisp" : "smooth");
                      setMatte(nextKind === "picture" ? "white" : "transparent");
                      setDitherMode(nextKind === "picture" ? "floyd-steinberg" : "none");
                    }}
                  >
                    {pendingImportKinds.map((option) => (
                      <option key={option.kind} value={option.kind}>{option.label}</option>
                    ))}
                  </select>
                </label>
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

export function defaultImportKindForFile(file: File | undefined): ManagedAssetKind {
  if (file?.type.startsWith("audio/")) return "sound";
  return "picture";
}

export function importKindsForFile(file: File | undefined, fixedKind?: ManagedAssetKind) {
  const allImageKinds = [
    { kind: "picture" as ManagedAssetKind, label: "Scenario Picture / PICT" },
    { kind: "icon" as ManagedAssetKind, label: "Icon / cicn 32 x 32" },
    { kind: "special-land-tile" as ManagedAssetKind, label: "Special Land Tile / cicn 32 x 32" }
  ];
  const soundKind = { kind: "sound" as ManagedAssetKind, label: "Sound / snd" };
  if (fixedKind) {
    const fixed = [...allImageKinds, soundKind].find((option) => option.kind === fixedKind);
    return fixed ? [fixed] : [{ kind: fixedKind, label: kindLabel(fixedKind) }];
  }
  if (file?.type.startsWith("audio/")) return [soundKind];
  if (file?.type.startsWith("image/")) return allImageKinds;
  return [...allImageKinds, soundKind];
}

export function isLikelyPixelArt(file: File | undefined, kind: ManagedAssetKind) {
  return kind === "special-land-tile" || kind === "icon" || Boolean(file && /\b(icon|tile|sprite|pixel)\b/i.test(file.name));
}

export function previewResourceIdForKind(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return -100;
  if (kind === "sound") return SCENARIO_SOUND_MIN_ID;
  if (kind === "icon") return 30126;
  return SCENARIO_PICTURE_MIN_ID;
}

export function targetLabel(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return "32 x 32 cicn, negative tile ID";
  if (kind === "icon") return "32 x 32 cicn";
  if (kind === "sound") return "Mac snd resource";
  return "Scenario PICT resource";
}

export function sourceSummary(info: MediaAssetSourceInfo) {
  if (info.kind === "sound") return `${formatDuration(info.durationMs)} at ${(info.sampleRate ?? 0).toLocaleString()} Hz, ${info.channels ?? 0} channel(s)`;
  return `${info.width ?? 0} x ${info.height ?? 0}`;
}

export function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs) return "0:00";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function commandErrorLabel(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function kindLabel(kind: ManagedAssetKind) {
  if (kind === "special-land-tile") return "Special Land Tile / cicn";
  if (kind === "picture") return "Picture / PICT";
  if (kind === "icon") return "Icon / cicn";
  if (kind === "sound") return "Sound / snd";
  return kind;
}
