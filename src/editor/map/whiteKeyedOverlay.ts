const whiteKeyedOverlayCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

export function drawWhiteKeyedOverlayImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.drawImage(whiteKeyedOverlay(image), x, y, width, height);
}

function whiteKeyedOverlay(image: HTMLImageElement) {
  const cached = whiteKeyedOverlayCache.get(image);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red >= 238 && green >= 238 && blue >= 238) data[index + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  whiteKeyedOverlayCache.set(image, canvas);
  return canvas;
}
