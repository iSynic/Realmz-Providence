import { useEffect, useState, type ReactNode } from "react";
import { FloatingWorkbenchPanel } from "../../ui";
import { TutorialTip } from "../TutorialTip";

const PAINT_PALETTE_MODE_STORAGE_KEY = "providence.mapPaintPalette.mode.v2";
const LEGACY_PAINT_PALETTE_STORAGE_KEY = "providence.mapPaintPalette.v1";
const FLOATING_PAINT_PALETTE_STORAGE_KEY = "providence.mapPaintPalette.floating.v1";

type PaintPaletteMode = "docked" | "floating";

export function PaintPaletteSurface({
  open,
  onSetOpen,
  children
}: {
  open: boolean;
  onSetOpen: (open: boolean) => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<PaintPaletteMode>(() => readPaintPaletteMode());
  const docked = mode === "docked";

  useEffect(() => {
    try {
      window.localStorage.setItem(PAINT_PALETTE_MODE_STORAGE_KEY, mode);
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, [mode]);

  return (
    <>
      <div className={`paint-palette-shell${open && docked ? " paint-palette-shell-docked" : ""}`}>
        <div className="paint-palette-shell-header">
          <TutorialTip
            title="Tile Palette"
            body="Dock the palette in the Paint Inspector or pop it out over the map. Custom palettes are saved with the project; drag tiles from any tab into the reveal dock to collect them."
            side="right"
          >
            <span>Tile Palette</span>
          </TutorialTip>
          <div>
            {!open && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSetOpen(true)}>
                Open
              </button>
            )}
            {open && docked && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => setMode("floating")}>
                Pop-Out
              </button>
            )}
            {open && (
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => onSetOpen(false)}>
                Close
              </button>
            )}
          </div>
        </div>
        {open && docked && <div className="paint-palette-scroll">{children}</div>}
        {open && !docked && <p className="empty-copy compact">Palette is floating over the map canvas.</p>}
      </div>
      {open && !docked && (
        <FloatingWorkbenchPanel
          title="Paint Palette"
          eyebrow="Map Tiles"
          storageKey={FLOATING_PAINT_PALETTE_STORAGE_KEY}
          defaultWidth={440}
          defaultHeight={560}
          minWidth={320}
          minHeight={360}
          className="paint-palette-floating-panel"
          actions={(
            <>
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => setMode("docked")}>
                Dock
              </button>
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => onSetOpen(false)}>
                Close
              </button>
            </>
          )}
        >
          {children}
        </FloatingWorkbenchPanel>
      )}
    </>
  );
}

export function readPaintPaletteMode(): PaintPaletteMode {
  if (typeof window === "undefined") return "docked";
  try {
    const stored = window.localStorage.getItem(PAINT_PALETTE_MODE_STORAGE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_PAINT_PALETTE_STORAGE_KEY);
    return resolvePaintPaletteMode(stored, legacy);
  } catch {
    return "docked";
  }
}

export function resolvePaintPaletteMode(stored: string | null, legacyStored: string | null): PaintPaletteMode {
  if (stored === "docked" || stored === "floating") return stored;
  try {
    const legacy = JSON.parse(legacyStored ?? "null") as { mode?: unknown } | null;
    return legacy?.mode === "floating" ? "floating" : "docked";
  } catch {
    return "docked";
  }
}
