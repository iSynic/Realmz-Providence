import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { ActionPointDirectTargetField } from "./ActionPointDirectTargetField";
import { scriptActionDefinitionFor } from "./scriptActionCatalog";

const project = {
  triggers: [],
  assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
} as unknown as Project;

describe("ActionPointDirectTargetField", () => {
  it("opens contextual settings instead of exposing a raw number input", () => {
    const html = renderToStaticMarkup(
      <ActionPointDirectTargetField
        project={project}
        selectedSlot={2}
        rawCode={66}
        id={1}
        definition={scriptActionDefinitionFor(66)}
        idLabel="Camping ability"
        sameMapActionPointStep={false}
        sameMapTarget={null}
        sameMapJumpTitle=""
        onEdit={() => undefined}
        onPreviewEntity={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Edit slot 3 Camping ability"');
    expect(html).toContain("Prevent camping");
    expect(html).not.toContain('type="number"');
  });
});
