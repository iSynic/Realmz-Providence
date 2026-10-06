import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { hasDesktopRuntime } from "../utils";
import { downloadBlob } from "./mapImageExport";

export async function saveMapImageExport(blob: Blob, fileName: string, extension: "jpg" | "zip") {
  if (!hasDesktopRuntime()) {
    downloadBlob(blob, fileName);
    return `Download requested: ${fileName}. Check your browser downloads.`;
  }

  const path = await save({
    title: extension === "jpg" ? "Save map JPEG" : "Save all maps ZIP",
    defaultPath: fileName,
    filters: [{ name: extension === "jpg" ? "JPEG image" : "ZIP archive", extensions: [extension] }]
  });
  if (!path) return "Export cancelled.";

  const encodedPath = btoa(Array.from(new TextEncoder().encode(path), (byte) => String.fromCharCode(byte)).join(""));
  const savedPath = await invoke<string>("save_map_image_export", new Uint8Array(await blob.arrayBuffer()), {
    headers: { "x-providence-export-path": encodedPath }
  });
  return `Saved: ${savedPath}`;
}
