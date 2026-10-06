import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadBlob } from "./mapImageExport";
import { saveMapImageExport } from "./saveMapImageExport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("./mapImageExport", () => ({ downloadBlob: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("map image file saving", () => {
  it("writes desktop JPEG bytes to the path selected in the native dialog", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const path = "C:\\Maps\\Café.jpg";
    vi.mocked(save).mockResolvedValue(path);
    vi.mocked(invoke).mockResolvedValue(path);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);

    await expect(saveMapImageExport(new Blob([bytes]), "land-00.jpg", "jpg")).resolves.toBe(`Saved: ${path}`);
    expect(save).toHaveBeenCalledWith({
      title: "Save map JPEG", defaultPath: "land-00.jpg",
      filters: [{ name: "JPEG image", extensions: ["jpg"] }]
    });
    expect(invoke).toHaveBeenCalledWith("save_map_image_export", bytes, {
      headers: { "x-providence-export-path": expect.any(String) }
    });
    const headers = vi.mocked(invoke).mock.calls[0][2]?.headers as Record<string, string>;
    const decodedPath = new TextDecoder().decode(Uint8Array.from(atob(headers["x-providence-export-path"]), (char) => char.charCodeAt(0)));
    expect(decodedPath).toBe(path);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("uses a ZIP filter for all-map archives", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(save).mockResolvedValue("C:\\Maps\\scenario.zip");
    vi.mocked(invoke).mockResolvedValue("C:\\Maps\\scenario.zip");
    await saveMapImageExport(new Blob(["zip"]), "scenario.zip", "zip");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      title: "Save all maps ZIP", filters: [{ name: "ZIP archive", extensions: ["zip"] }]
    }));
  });

  it("does not write or claim success when the save dialog is cancelled", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(save).mockResolvedValue(null);
    await expect(saveMapImageExport(new Blob(["jpg"]), "map.jpg", "jpg")).resolves.toBe("Export cancelled.");
    expect(invoke).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("propagates native write errors rather than reporting a saved file", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(save).mockResolvedValue("C:\\Maps\\map.jpg");
    vi.mocked(invoke).mockRejectedValue("Access denied");
    await expect(saveMapImageExport(new Blob(["jpg"]), "map.jpg", "jpg")).rejects.toBe("Access denied");
  });

  it("keeps browser downloads and identifies their destination mechanism", async () => {
    vi.stubGlobal("window", {});
    const blob = new Blob(["jpg"]);
    await expect(saveMapImageExport(blob, "map.jpg", "jpg")).resolves.toContain("Check your browser downloads");
    expect(downloadBlob).toHaveBeenCalledWith(blob, "map.jpg");
    expect(save).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
