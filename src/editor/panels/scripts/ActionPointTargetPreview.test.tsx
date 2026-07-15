import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionPointTargetPreview } from "./ActionPointTargetPreview";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

const definition = {
  target: { label: "Quest Flag" }
} as ScriptActionDefinition;

const option = {
  key: "quest:4",
  value: 4,
  label: "Quest Flag 4",
  detail: "Scenario quest state",
  summary: "Used by two scripts"
};

describe("ActionPointTargetPreview", () => {
  it("renders target context without legacy media controls", () => {
    const html = renderToStaticMarkup(
      <ActionPointTargetPreview
        option={option}
        definition={definition}
        behavior="Set this flag"
        canExpand={false}
        expanded={false}
        onToggleExpanded={() => undefined}
      />
    );

    expect(html).toContain("Quest Flag 4");
    expect(html).toContain("Used by two scripts");
    expect(html).toContain("Set this flag");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Play");
  });

  it("offers the full-preview toggle only when the target can expand", () => {
    const html = renderToStaticMarkup(
      <ActionPointTargetPreview
        option={option}
        definition={definition}
        canExpand
        expanded={false}
        onToggleExpanded={() => undefined}
      />
    );

    expect(html).toContain("Show Full Preview");
  });
});
