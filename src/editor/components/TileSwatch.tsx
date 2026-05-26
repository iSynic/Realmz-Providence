import { useEffect, useMemo, useRef } from "react";
import { classifyTileValue } from "../map/tileMetadata";
import { AtlasEntry, IconEntry, TilesetAsset } from "../types";
import { drawTileSprite, tileColor } from "./TileSprite";

export function TileSwatch({
  atlas,
  icons,
  tile,
  tileset,
  showBadge = true
}: {
  atlas: AtlasEntry | null;
  icons?: Record<number, IconEntry>;
  tile: number;
  tileset: TilesetAsset | null;
  showBadge?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metadata = useMemo(() => classifyTileValue(tile, tileset, [], icons), [icons, tile, tileset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = tileColor(tile);
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawTileSprite(context, atlas, tile, 0, 0, canvas.width, canvas.height, icons);
  }, [atlas, icons, tile]);

  return (
    <span className={`tile-swatch tile-kind-${metadata.kind}`} aria-hidden="true">
      <canvas ref={canvasRef} width={32} height={32} />
      {showBadge && <span className="tile-swatch-badge">{tile}</span>}
    </span>
  );
}
