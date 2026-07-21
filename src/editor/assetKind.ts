import type { ManagedAssetKind } from "./types";

export function managedAssetKindForType(type: string): ManagedAssetKind {
  if (type === "sound") return "sound";
  if (type === "music") return "music";
  if (type === "special-land-tile") return "special-land-tile";
  if (type === "icon" || type.includes("icon")) return "icon";
  if (type === "picture") return "picture";
  if (type === "text" || type.includes("text") || type.includes("string")) return "text";
  return "other";
}
