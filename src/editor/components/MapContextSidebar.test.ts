import { describe, expect, it } from "vitest";
import {
  LandLayoutEditor,
  LandTileAtlasEditor,
  MapContextSidebar,
  MapSelectionSidebar,
  RandomAreasWorkbench
} from "./MapContextSidebar";

describe("MapContextSidebar facade", () => {
  it("keeps the extracted map-context entrypoints available", () => {
    expect(MapContextSidebar.name).toBe("MapBrowserSidebar");
    expect(MapSelectionSidebar.name).toBe("MapInspectorSidebar");
    expect(LandLayoutEditor).toBeTypeOf("function");
    expect(LandTileAtlasEditor).toBeTypeOf("function");
    expect(RandomAreasWorkbench).toBeTypeOf("function");
  });
});
