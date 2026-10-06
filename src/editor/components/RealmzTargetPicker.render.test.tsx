import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { TargetPicker, targetPickerReferencePreviewModel, type ScriptTargetOption } from "./RealmzTargetPicker";

const project = {
  scenario: { name: "Picker test", projectPath: "" },
  source: { sourcePath: "" },
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

  it("lets a preview-owning host suppress the picker's inline media preview", () => {
    const soundProject = {
      ...project,
      assets: [{
        id: "asset:sound:619",
        kind: "sound",
        resourceId: 619,
        resourceType: "snd ",
        label: "Arrow Hit",
        exportState: "bundled",
        previewPath: "/arrow-hit.wav",
        mimeType: "audio/wav"
      }],
      assetCatalog: { sounds: [], pictures: [], icons: [] }
    } as unknown as Project;
    const renderSoundPicker = (showPreview?: boolean) => renderToStaticMarkup(
      <TargetPicker
        project={soundProject}
        opcode={9}
        value={619}
        onChange={() => undefined}
        showPreview={showPreview}
      />
    );

    expect(renderSoundPicker()).toContain('data-reference-preview-kind="audio"');
    expect(renderSoundPicker(false)).not.toContain('data-reference-preview-kind="audio"');
  });

  it("authors signed target behavior without a raw negative ID field", () => {
    const renderSignedMessage = (value: number, showSignedBehavior?: boolean) => renderToStaticMarkup(
      <TargetPicker
        project={{
          ...project,
          messages: [{ id: 12, text: "Move quickly." }]
        } as unknown as Project}
        opcode={1}
        value={value}
        onChange={() => undefined}
        showSignedBehavior={showSignedBehavior}
      />
    );

    expect(renderSignedMessage(-12)).toContain("Continue without waiting");
    expect(renderSignedMessage(-12)).toContain('type="radio" name="target-mode-1" checked=""');
    expect(renderSignedMessage(-12, false)).not.toContain("Continue without waiting");
  });
});
