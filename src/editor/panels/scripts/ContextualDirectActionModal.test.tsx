import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { ContextualDirectActionModal } from "./ContextualDirectActionModal";

const project = {
  messages: [],
  triggers: [],
  maps: [],
  simpleEncounters: [],
  complexEncounters: [],
  battles: [],
  items: [],
  scenarioItems: [],
  treasures: [],
  shops: [],
  monsters: [],
  monsterSets: [],
  assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
} as unknown as Project;

function renderModal(rawCode: number, initialValue: number) {
  return renderToStaticMarkup(
    <ContextualDirectActionModal
      project={project}
      title="Action Settings"
      description="Configure this action."
      rawCode={rawCode}
      initialValue={initialValue}
      onApply={() => undefined}
      onCancel={() => undefined}
    />
  );
}

describe("ContextualDirectActionModal", () => {
  it("renders finite behavior choices in the shared framed modal", () => {
    const html = renderModal(66, 1);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Camping ability");
    expect(html).toContain("Allow camping");
    expect(html).toContain("Prevent camping");
    expect(html).toContain("Technical Details");
    expect(html).toContain("Apply Settings");
  });

  it("preserves undocumented imported choice values explicitly", () => {
    const html = renderModal(104, 7);

    expect(html).toContain("Keep imported value 7");
    expect(html).toContain("outside the documented authoring choices");
  });

  it("separates signed behavior from a guided numeric magnitude", () => {
    const html = renderModal(14, -3);

    expect(html).toContain("Characters to pick");
    expect(html).toContain("Restrict to eligible characters");
    expect(html).toContain('value="3"');
    expect(html).toContain("<dd>-3</dd>");
  });
});
