import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { TargetPicker, targetPickerReferencePreviewModel, type ScriptTargetOption } from "./RealmzTargetPicker";

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

  it("builds shared preview models only for media targets", () => {
    const sound: ScriptTargetOption = {
      key: "sound:624",
      value: 624,
      label: "Sound 624",
      detail: "Scenario sound",
      compatibility: "Realmz resource"
    };
    const picture: ScriptTargetOption = {
      key: "picture:30000",
      value: 30000,
      label: "Picture 30000",
      detail: "Scenario picture"
    };

    expect(targetPickerReferencePreviewModel(9, -624, sound, null)).toMatchObject({
      kind: "audio",
      state: "unavailable",
      title: "Sound 624",
      src: null
    });
    expect(targetPickerReferencePreviewModel(27, 30000, picture, "/picture.png")).toMatchObject({
      kind: "image",
      state: "resolved",
      title: "Picture 30000",
      src: "/picture.png"
    });
    expect(targetPickerReferencePreviewModel(1, 12, { ...sound, key: "message:12" }, null)).toBeNull();
  });
});
