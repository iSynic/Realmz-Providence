export type MapOverlaySpriteId = "path" | "secret";

type OverlaySpriteDefinition = {
  id: MapOverlaySpriteId;
  label: string;
  source: string;
  src: string | null;
  confirmed: boolean;
};

export type MapOverlaySprite = OverlaySpriteDefinition & {
  image: HTMLImageElement | null;
};

const DEFINITIONS: Record<MapOverlaySpriteId, OverlaySpriteDefinition> = {
  path: {
    id: "path",
    label: "Divinity path/passable marker",
    source: "Divinity manual PICT 2007",
    src: "/divinity-manual/assets/pict2007.png",
    confirmed: true
  },
  secret: {
    id: "secret",
    label: "Realmz secret marker",
    source: "Realmz reference library cicn 139 vendored for Providence overlays",
    src: "/map-overlays/realmz-secret-139.png",
    confirmed: true
  }
};

const sprites: Record<MapOverlaySpriteId, MapOverlaySprite> = {
  path: { ...DEFINITIONS.path, image: null },
  secret: { ...DEFINITIONS.secret, image: null }
};

let loadStarted = false;

export function mapOverlaySprite(id: MapOverlaySpriteId) {
  return sprites[id];
}

export function loadMapOverlaySprites(onLoad?: () => void) {
  if (loadStarted) return sprites;
  loadStarted = true;
  for (const definition of Object.values(DEFINITIONS)) {
    if (!definition.src || typeof Image === "undefined") continue;
    const image = new Image();
    image.onload = () => {
      sprites[definition.id] = { ...definition, image };
      onLoad?.();
    };
    image.src = definition.src;
  }
  return sprites;
}
