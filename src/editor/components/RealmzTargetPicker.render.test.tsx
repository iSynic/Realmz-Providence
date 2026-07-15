import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { TargetPicker } from "./RealmzTargetPicker";

const project = {
  scenario: { name: "Picker test", projectPath: "" },
  messages: [{ id: 0, text: "Do not use" }],
  triggers: []
} as unknown as Project;

function renderPicker(allowCreateAtZero: boolean) {
  return renderToStaticMarkup(
    <TargetPicker
      project={project}
      opcode={1}
      value={0}
      onChange={() => undefined}
      onCreate={() => undefined}
      allowCreateAtZero={allowCreateAtZero}
    />
  );
}

describe("TargetPicker creation actions", () => {
  it("can treat a resolved ID zero as an unassigned authoring target", () => {
    expect(renderPicker(false)).not.toContain("Create Next String");
    expect(renderPicker(true)).toContain("Create Next String");
  });
});
