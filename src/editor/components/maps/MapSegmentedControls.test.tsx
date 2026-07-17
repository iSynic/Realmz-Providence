import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MapEntity, Project } from "../../types";
import { LandLayoutEditor } from "./LandLayoutWorkbench";
import { LandCellSecretEditor } from "./MapActionPointInspector";
import { MapSectionTabs } from "./MapSectionTabs";

describe("map segmented controls", () => {
  it("uses the shared selected and roving-tab contract for land secret state", () => {
    const markup = renderToStaticMarkup(
      <LandCellSecretEditor
        map={{ id: "land:0" } as MapEntity}
        cell={{ x: 4, y: 5, tile: 0x4001 }}
        onApplyCommand={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Secret area state"');
    expect(markup).toContain('class="is-selected"');
    expect(markup).toContain('aria-pressed="true" tabindex="0"');
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
  });

  it("uses the shared display-mode control in Land Layout", () => {
    const markup = renderToStaticMarkup(
      <LandLayoutEditor
        project={{ maps: [], landLayout: { cells: [] }, assetCatalog: { tilesets: [] } } as unknown as Project}
        selectedMap={null}
        atlasEntries={{}}
        icons={{}}
        selectedCell={null}
        onSetSelectedCell={() => undefined}
        onSelectMap={() => undefined}
        onApplyCommand={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Land layout display mode"');
    expect(markup).toContain('class="is-selected"');
    expect(markup).toContain('aria-pressed="true" tabindex="0"');
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(1);
  });

  it("presents map sections as horizontal workbench tabs", () => {
    const markup = renderToStaticMarkup(
      <MapSectionTabs value="canvas" onChange={() => undefined} />
    );

    expect(markup).toContain('aria-label="Map workbench sections"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true" tabindex="0" class="is-selected"');
    expect(markup).toContain("Random Encounters");
    expect(markup.match(/role="tab"/g)).toHaveLength(4);
  });
});
