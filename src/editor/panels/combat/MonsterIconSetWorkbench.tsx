import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, LibraryCatalog, Project, ProjectCommand } from "../../types";
import { encodeCicnResource, mirrorRgbaHorizontally } from "../../cicnEncoder";
import {
  IconLibraryFacingMode,
  createIconLibraryEntry,
  deleteIconLibraryEntry
} from "../../iconLibrary";
import type { CombatLookups } from "./combatLookups";
import {
  MONSTER_ICON_PAIR_OFFSET,
  MONSTER_ICON_SET_LIMIT,
  monsterIconSourcePairs,
  monsterIconSourceStatusLabel,
  monsterIconTargetPairs,
  monsterIconTargetSourceStatus,
  monsterIconTargetStatusTitle,
  nextImportedMonsterIconBaseId,
  nextScenarioMonsterIconTargetBaseId,
  previewPathFromCicnBase64
} from "./iconSetModel";
import { NumberField } from "./CombatFields";
import {
  IconPairPreview,
  bytesToBase64,
  loadLibraryResourceBase64
} from "./IconPairResources";

const MONSTER_ICON_CANVAS_PRESETS = [
  { key: "32x32", label: "32 x 32", width: 32, height: 32 },
  { key: "32x64", label: "32 x 64", width: 32, height: 64 },
  { key: "64x32", label: "64 x 32", width: 64, height: 32 },
  { key: "64x64", label: "64 x 64", width: 64, height: 64 }
] as const;

export function MonsterIconSetWorkbench({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onApplyCommand,
  onUpdateLibraryCatalog
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const targets = useMemo(() => monsterIconTargetPairs(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const sources = useMemo(() => monsterIconSourcePairs(catalog, lookups), [catalog, lookups]);
  const [targetQuery, setTargetQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState(() => targets[0]?.baseId ?? 0);
  const [selectedSourceKey, setSelectedSourceKey] = useState(() => sources[0]?.key ?? "");
  const [activeIconSetPane, setActiveIconSetPane] = useState<"target" | "source">("source");
  const [status, setStatus] = useState("");
  const [iconImportOpen, setIconImportOpen] = useState(false);
  const [iconImportCanvasKey, setIconImportCanvasKey] = useState<(typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]>("32x32");
  const [iconImportAdvanced, setIconImportAdvanced] = useState(false);
  const [iconImportBaseFile, setIconImportBaseFile] = useState<File | null>(null);
  const [iconImportPairedFile, setIconImportPairedFile] = useState<File | null>(null);
  const baseImportInputRef = useRef<HTMLInputElement | null>(null);
  const pairedImportInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selectedTargetId <= 0 && targets[0]) setSelectedTargetId(targets[0].baseId);
  }, [selectedTargetId, targets]);
  useEffect(() => {
    if (!sources.some((source) => source.key === selectedSourceKey)) setSelectedSourceKey(sources[0]?.key ?? "");
  }, [selectedSourceKey, sources]);
  const filteredTargets = useMemo(
    () => filterRecords(targets, targetQuery, (target) => `${target.baseId} ${target.asset?.label ?? ""} ${target.override?.sourceLabel ?? ""} ${monsterIconSourceStatusLabel(monsterIconTargetSourceStatus(target))}`),
    [targetQuery, targets]
  );
  const filteredSources = useMemo(
    () => filterRecords(sources, sourceQuery, (source) => `${source.baseId} ${source.sourceLabel ?? ""} ${source.asset?.label ?? ""}`),
    [sourceQuery, sources]
  );
  const selectedTarget = targets.find((target) => target.baseId === selectedTargetId) ?? null;
  const selectedSource = sources.find((source) => source.key === selectedSourceKey) ?? sources[0] ?? null;
  const selectedTargetBaseId = selectedTarget?.baseId ?? selectedTargetId;
  const selectedTargetOverrideSource = selectedTarget?.override
    ? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId && source.sourceKind === selectedTarget.override?.sourceKind)
      ?? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId)
      ?? null
    : null;
  const selectSourceByBaseId = (sourceBaseIconId: number) => {
    setSelectedSourceKey(sources.find((source) => source.baseId === sourceBaseIconId)?.key ?? sources[0]?.key ?? "");
    setActiveIconSetPane("source");
  };
  const selectTargetByBaseId = (targetBaseIconId: number) => {
    setSelectedTargetId(Math.max(0, Math.trunc(Math.abs(targetBaseIconId))));
    setActiveIconSetPane("target");
  };
  const applyOverride = async (targetBaseIconId = selectedTargetBaseId, sourceKey = selectedSource?.key ?? "") => {
    const source = sources.find((candidate) => candidate.key === sourceKey);
    const sourceBaseIconId = source?.baseId ?? 0;
    if (!source?.asset || !source.pairedAsset || !targetBaseIconId) {
      setStatus("Choose a target icon and a complete source icon pair before applying an override.");
      return;
    }
    try {
      const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
        loadLibraryResourceBase64(source.asset, previewContext, catalog),
        loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
      ]);
      if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) {
        setStatus(`${source.sourceLabel ?? `Source ${sourceBaseIconId}`} is missing one facing resource.`);
        return;
      }
      onApplyCommand?.({
        kind: "upsertMonsterIconOverride",
        label: `Override monster icon ${targetBaseIconId} from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}`,
        override: {
          targetBaseIconId,
          sourceBaseIconId,
          sourceKind: source.sourceKind ?? "monster-mash",
          sourceLabel: source.asset.label || source.sourceLabel,
          sourceBaseResourceBase64,
          sourcePairedResourceBase64
        }
      });
      setSelectedTargetId(targetBaseIconId);
      setSelectedSourceKey(source.key);
      setStatus(`Monster icon ${targetBaseIconId} will export from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load source icon resource data.");
    }
  };
  const deleteTargetOverride = (targetBaseIconId = selectedTargetBaseId) => {
    if (!targetBaseIconId || !selectedTarget?.override) return;
    onApplyCommand?.({ kind: "deleteMonsterIconOverride", label: `Delete monster icon override ${targetBaseIconId}`, targetBaseIconId });
    setStatus(`Deleted override for monster icon ${targetBaseIconId}; default art will be used when available.`);
  };
  const allowTargetDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("application/x-realmz-monster-icon-source")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const copyTargetToIconLibrary = async () => {
    if (!selectedTarget || !onUpdateLibraryCatalog) return;
    try {
      const [base64, pairedBase64] = selectedTarget.override
        ? [selectedTarget.override.sourceBaseResourceBase64, selectedTarget.override.sourcePairedResourceBase64]
        : selectedTarget.resourceBase64 && selectedTarget.pairedResourceBase64
          ? [selectedTarget.resourceBase64, selectedTarget.pairedResourceBase64]
        : selectedTarget.asset && selectedTarget.pairedAsset
          ? await Promise.all([
              loadLibraryResourceBase64(selectedTarget.asset, previewContext, catalog),
              loadLibraryResourceBase64(selectedTarget.pairedAsset, previewContext, catalog)
            ])
          : [null, null];
      if (!base64 || !pairedBase64) {
        setStatus(`Scenario icon ${selectedTarget.baseId} is missing one facing resource.`);
        return;
      }
      const label = selectedTarget.override
        ? `Scenario Icon ${selectedTarget.baseId} Override`
        : selectedTarget.sourceLabel || selectedTarget.asset?.label || `Scenario Icon ${selectedTarget.baseId}`;
      const baseMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.asset ?? null : selectedTarget.asset;
      const pairedMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.pairedAsset ?? null : selectedTarget.pairedAsset;
      const targetMetadata = selectedTargetOverrideSource
        ? { facingMode: selectedTargetOverrideSource.facingMode, canvas: selectedTargetOverrideSource.canvas }
        : { facingMode: "custom" as IconLibraryFacingMode, canvas: null };
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: {
          kind: "external-resource",
          sourceId: `scenario-monster-icon:${selectedTarget.baseId}`,
          sourceLabel: label
        },
        ...targetMetadata,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId,
            label: baseMetadataAsset?.label || `${label} left`,
            resourceBase64: base64,
            previewPath: previewPathFromCicnBase64(base64, baseMetadataAsset?.previewPath ?? null),
            bytes: baseMetadataAsset?.bytes,
            sha256: baseMetadataAsset?.sha256
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId + MONSTER_ICON_PAIR_OFFSET,
            label: pairedMetadataAsset?.label || `${label} right`,
            resourceBase64: pairedBase64,
            previewPath: previewPathFromCicnBase64(pairedBase64, pairedMetadataAsset?.previewPath ?? null),
            bytes: pairedMetadataAsset?.bytes,
            sha256: pairedMetadataAsset?.sha256
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Added ${entity.label} to Icon Library` : "Updated Icon Library");
      setStatus(entity ? `Added ${entity.label} to the Providence Icon Library.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to copy scenario icons into the Providence Icon Library.");
    }
  };
  const deleteSelectedIconVariant = () => {
    if (!catalog || !selectedSource || selectedSource.sourceKind !== "providence-library" || !onUpdateLibraryCatalog) return;
    const nextCatalog = deleteIconLibraryEntry(catalog, selectedSource.key);
    const nextSourceKey = sources.find((source) => source.key !== selectedSource.key)?.key ?? "";
    onUpdateLibraryCatalog(nextCatalog, `Deleted ${selectedSource.sourceLabel ?? "Icon Variant"}`);
    setSelectedSourceKey(nextSourceKey);
    setActiveIconSetPane("source");
    setStatus(`Deleted ${selectedSource.sourceLabel ?? "Icon Variant"} from the Providence Icon Library.`);
  };
  const createImportedIconSet = async () => {
    if (!onUpdateLibraryCatalog) return;
    if (!iconImportBaseFile) {
      setStatus("Choose a source image before importing a monster icon set.");
      return;
    }
    try {
      const canvas = monsterIconCanvasPreset(iconImportCanvasKey);
      const baseImage = await loadImageFileToRgba(iconImportBaseFile, canvas.width, canvas.height);
      const pairedImage = iconImportAdvanced && iconImportPairedFile
        ? await loadImageFileToRgba(iconImportPairedFile, canvas.width, canvas.height)
        : { width: canvas.width, height: canvas.height, rgba: mirrorRgbaHorizontally(baseImage) };
      const baseBytes = encodeCicnResource(baseImage);
      const pairedBytes = encodeCicnResource(pairedImage);
      const baseId = nextImportedMonsterIconBaseId(sources);
      const label = `${stripFileExtension(iconImportBaseFile.name) || "Imported Monster"} Icon Set`;
      const facingMode: IconLibraryFacingMode = iconImportAdvanced && iconImportPairedFile ? "custom" : "mirrored";
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: { kind: "external-resource", sourceLabel: iconImportBaseFile.name },
        facingMode,
        canvas,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: baseId,
            label: `${label} base`,
            resourceBase64: bytesToBase64(baseBytes),
            previewPath: rgbaToDataUrl(baseImage),
            bytes: baseBytes.length,
            width: canvas.width,
            height: canvas.height
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: baseId + MONSTER_ICON_PAIR_OFFSET,
            label: `${label} paired`,
            resourceBase64: bytesToBase64(pairedBytes),
            previewPath: rgbaToDataUrl(pairedImage),
            bytes: pairedBytes.length,
            width: canvas.width,
            height: canvas.height
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Imported ${entity.label}` : "Updated Icon Library");
      if (entity) {
        setSelectedSourceKey(entity.id);
        setActiveIconSetPane("source");
      }
      setIconImportBaseFile(null);
      setIconImportPairedFile(null);
      if (baseImportInputRef.current) baseImportInputRef.current.value = "";
      if (pairedImportInputRef.current) pairedImportInputRef.current.value = "";
      setStatus(entity ? `Imported ${entity.label} as ${facingMode === "mirrored" ? "mirrored" : "custom"} facing art.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to import monster icon set.");
    }
  };
  const hasSelectedSourcePair = Boolean(selectedSource?.asset && selectedSource.pairedAsset);
  const hasSelectedTargetPair = Boolean(
    selectedTarget?.override ||
    (selectedTarget?.resourceBase64 && selectedTarget.pairedResourceBase64) ||
    (selectedTarget?.asset && selectedTarget.pairedAsset)
  );
  const addSourceToScenarioIcons = () => {
    const targetBaseId = nextScenarioMonsterIconTargetBaseId(selectedSource?.baseId ?? 0, targets);
    setActiveIconSetPane("target");
    void applyOverride(targetBaseId, selectedSource?.key ?? "");
  };
  const replaceSelectedTargetArt = () => {
    if (!selectedTargetBaseId) return;
    setActiveIconSetPane("target");
    void applyOverride(selectedTargetBaseId, selectedSource?.key ?? "");
  };
  return (
    <article className="combat-editor icon-set-workbench">
      <header className="combat-editor-header icon-set-header">
        <div>
          <h2>Build Icon Set</h2>
          <p>Copy paired Monster Mash or Providence Icon Library cicn resources into the scenario as overrides or supplements for standard monster icon IDs.</p>
        </div>
        <span
          className={(project.monsterIconOverrides ?? []).length >= MONSTER_ICON_SET_LIMIT ? "icon-set-limit warning" : "icon-set-limit"}
          title="The Divinity manual describes Realmz as capable of holding around 127 monster icon sets per scenario. Modern Realmz source resolves cicn resources dynamically, so Providence treats this as a compatibility warning rather than a hard runtime cap."
        >
          {(project.monsterIconOverrides ?? []).length} / ~{MONSTER_ICON_SET_LIMIT} overrides
        </span>
      </header>
      <section className="icon-set-controls">
        <NumberField label="Target Icon" value={selectedTargetBaseId} onCommit={selectTargetByBaseId} />
        <NumberField label="Source Icon" value={selectedSource?.baseId ?? 0} onCommit={selectSourceByBaseId} />
        <div className="icon-set-action-group">
          <button
            type="button"
            className="btn btn-primary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair}
            onClick={addSourceToScenarioIcons}
            title="Copy the selected library/source icon pair into the next available scenario override target."
          >
            Copy To Scenario Icons
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair || !selectedTargetBaseId}
            onClick={replaceSelectedTargetArt}
            title="Replace the selected target icon art with the selected library/source icon pair."
          >
            Replace Target Art
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedTargetPair || !onUpdateLibraryCatalog}
            onClick={() => void copyTargetToIconLibrary()}
          >
            Copy To Icon Library
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!selectedTarget?.override} onClick={() => deleteTargetOverride()}>
            Delete Override
          </button>
          {selectedSource?.sourceKind === "providence-library" ? (
            <button type="button" className="btn btn-danger btn-sm" disabled={!catalog || !onUpdateLibraryCatalog} onClick={deleteSelectedIconVariant}>
              Delete Icon Variant
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm icon-set-import-toggle"
          disabled={!onUpdateLibraryCatalog}
          onClick={() => setIconImportOpen((open) => !open)}
        >
          Import Image Set
        </button>
        {status ? <small>{status}</small> : null}
      </section>
      {iconImportOpen ? (
        <section className="icon-set-import-panel">
          <header>
            <strong>Import Monster Icon Set</strong>
            <small>One image creates a mirrored pair; advanced import can supply separate facing art.</small>
          </header>
          <label>
            <span>Canvas</span>
            <select value={iconImportCanvasKey} onChange={(event) => setIconImportCanvasKey(event.currentTarget.value as (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"])}>
              {MONSTER_ICON_CANVAS_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Source Image</span>
            <span className="icon-set-file-control">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => baseImportInputRef.current?.click()}>
                Choose Image
              </button>
              <small>{iconImportBaseFile?.name ?? "No file selected."}</small>
              <input
                ref={baseImportInputRef}
                className="icon-set-file-input"
                type="file"
                accept="image/png,image/gif,image/jpeg,image/webp"
                aria-label="Source image"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportBaseFile(event.currentTarget.files?.[0] ?? null)}
              />
            </span>
          </label>
          <label className="checkbox-row">
            <span>Custom paired image</span>
            <input type="checkbox" checked={iconImportAdvanced} onChange={(event) => setIconImportAdvanced(event.currentTarget.checked)} />
          </label>
          {iconImportAdvanced ? (
            <label>
              <span>Paired Image</span>
              <span className="icon-set-file-control">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pairedImportInputRef.current?.click()}>
                  Choose Paired Image
                </button>
                <small>{iconImportPairedFile?.name ?? "No file selected."}</small>
                <input
                  ref={pairedImportInputRef}
                  className="icon-set-file-input"
                  type="file"
                  accept="image/png,image/gif,image/jpeg,image/webp"
                  aria-label="Paired image"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportPairedFile(event.currentTarget.files?.[0] ?? null)}
                />
              </span>
            </label>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" disabled={!onUpdateLibraryCatalog || !iconImportBaseFile} onClick={() => void createImportedIconSet()}>
            Create Library Icon Set
          </button>
        </section>
      ) : null}
      <div className="icon-set-layout">
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Library Monster Icon Sets</strong>
            <small>{sources.length} source pairs</small>
          </header>
          <input value={sourceQuery} onChange={(event) => setSourceQuery(event.currentTarget.value)} placeholder="Search library monster icon sets..." />
          <div className="icon-set-scroll">
            {filteredSources.map((source) => (
              <button
                key={source.key}
                type="button"
                draggable
                className={`icon-set-row${activeIconSetPane === "source" && selectedSourceKey === source.key ? " selected" : ""}`}
                onClick={() => {
                  setSelectedSourceKey(source.key);
                  setActiveIconSetPane("source");
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-realmz-monster-icon-source", source.key);
                  event.dataTransfer.setData("text/plain", source.sourceLabel ?? `Source ${source.baseId}`);
                }}
              >
                <IconPairPreview baseAsset={source.asset} pairedAsset={source.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>{source.sourceLabel ?? `Source ${source.baseId}`}</strong>
                  <small>{source.sourceKind === "providence-library" ? "Providence Icon Library" : "Monster Mash"} | pair {source.baseId + MONSTER_ICON_PAIR_OFFSET}</small>
                </span>
              </button>
            ))}
            {filteredSources.length === 0 ? <p className="empty-copy compact">No library monster icon sets match that search.</p> : null}
          </div>
        </section>
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Monster Icon Targets</strong>
            <small>{targets.length} target pairs</small>
          </header>
          <input value={targetQuery} onChange={(event) => setTargetQuery(event.currentTarget.value)} placeholder="Search monster icon targets..." />
          <div className="icon-set-scroll">
            {filteredTargets.map((target) => {
              const previewBaseAsset = target.asset;
              const previewPairedAsset = target.pairedAsset;
              const sourceStatus = monsterIconTargetSourceStatus(target);
              const statusLabel = monsterIconSourceStatusLabel(sourceStatus);
              return (
                <button
                  key={target.baseId}
                  type="button"
                  className={`icon-set-row${activeIconSetPane === "target" && selectedTargetId === target.baseId ? " selected" : ""}${target.override ? " overridden" : ""}`}
                  onClick={() => {
                    setSelectedTargetId(target.baseId);
                    setActiveIconSetPane("target");
                  }}
                  onDragOver={allowTargetDrop}
                  onDragEnter={allowTargetDrop}
                  onDrop={(event) => {
                    const sourceKey = event.dataTransfer.getData("application/x-realmz-monster-icon-source");
                    if (!sourceKey) return;
                    event.preventDefault();
                    setActiveIconSetPane("target");
                    void applyOverride(target.baseId, sourceKey);
                  }}
                >
                  <IconPairPreview baseAsset={previewBaseAsset} pairedAsset={previewPairedAsset} previewContext={previewContext} />
                  <span>
                    <strong>Icon {target.baseId}</strong>
                    <small>{target.override?.sourceLabel ?? target.sourceLabel ?? target.asset?.label ?? (target.referenced ? "Referenced scenario icon target" : "Available scenario icon target")}</small>
                    <small className={`icon-target-source-badge ${sourceStatus}`} title={monsterIconTargetStatusTitle(sourceStatus)}>
                      {statusLabel}{target.override ? `: ${target.override.sourceLabel ?? `Source ${target.override.sourceBaseIconId}`}` : ""}
                    </small>
                  </span>
                </button>
              );
            })}
            {filteredTargets.length === 0 ? <p className="empty-copy compact">No monster icon targets match that search.</p> : null}
          </div>
        </section>
      </div>
    </article>
  );
}

function filterRecords<T>(records: T[], query: string, text: (record: T) => string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => text(record).toLowerCase().includes(needle));
}

function monsterIconCanvasPreset(key: (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]) {
  return MONSTER_ICON_CANVAS_PRESETS.find((preset) => preset.key === key) ?? MONSTER_ICON_CANVAS_PRESETS[0];
}

function stripFileExtension(name: string) {
  return name.replace(/\.[^.]+$/, "").trim();
}

async function loadImageFileToRgba(file: File, width: number, height: number) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Unable to load ${file.name}.`));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const left = Math.floor((width - drawWidth) / 2);
    const top = Math.floor((height - drawHeight) / 2);
    context.drawImage(image, left, top, drawWidth, drawHeight);
    return { width, height, rgba: context.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbaToDataUrl(image: { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}
