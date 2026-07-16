import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MapEntity, Project } from "../../types";
import { LandLayoutEditor } from "./LandLayoutWorkbench";
import { LandCellSecretEditor } from "./MapActionPointInspector";

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
});
