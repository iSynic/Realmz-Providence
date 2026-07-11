import { memo, useEffect, useMemo, useRef, useState } from "react";
import { classifyTileValue } from "../map/tileMetadata";
import { AtlasEntry, IconEntry, TilesetAsset } from "../types";
import { drawTileSprite, tileColor } from "./TileSprite";
import { isStockCombatClearingTile, isStockHiddenWalkableTile } from "../map/secrets";
import { drawWhiteKeyedOverlayImage } from "../map/whiteKeyedOverlay";

function TileSwatchComponent({
  atlas,
  icons,
  tile,
  tileset,
  showBadge = true,
  allowIconFallback = true
}: {
  atlas: AtlasEntry | null;
  icons?: Record<number, IconEntry>;
  tile: number;
  tileset: TilesetAsset | null;
  showBadge?: boolean;
  allowIconFallback?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hiddenWalkableMarker, setHiddenWalkableMarker] = useState<HTMLImageElement | null>(null);
  const metadata = useMemo(() => classifyTileValue(tile, tileset, [], icons), [icons, tile, tileset]);
  const showHiddenWalkable = isStockHiddenWalkableTile(tile, tileset?.landlook);
  const showCombatClearing = isStockCombatClearingTile(tile, tileset?.landlook);

  useEffect(() => {
    if (!showHiddenWalkable || typeof Image === "undefined") {
      setHiddenWalkableMarker(null);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setHiddenWalkableMarker(image);
    };
    image.src = "/divinity-manual/assets/pict2007.png";
    return () => {
      active = false;
    };
  }, [showHiddenWalkable]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = tileColor(tile);
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawTileSprite(context, atlas, tile, 0, 0, canvas.width, canvas.height, icons, allowIconFallback);
    if (showHiddenWalkable && hiddenWalkableMarker?.complete) {
      const inset = 2;
      drawWhiteKeyedOverlayImage(context, hiddenWalkableMarker, inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
    }
  }, [allowIconFallback, atlas, hiddenWalkableMarker, icons, showHiddenWalkable, tile]);

  return (
    <span className={`tile-swatch tile-kind-${metadata.kind}${showCombatClearing ? " tile-swatch--combat-clearing" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} width={32} height={32} />
      {showBadge && <span className="tile-swatch-badge">{tile}</span>}
    </span>
  );
}

export const TileSwatch = memo(TileSwatchComponent);
